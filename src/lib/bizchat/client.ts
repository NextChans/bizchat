import 'server-only'
import { createHash } from 'node:crypto'
import type { Merchant } from '../bridge/merchant'

/**
 * 비즈챗 서버 간 API. 비즈챗에는 화면이 없다. 가맹점이 보는 화면은 전부 이 브릿지가 그리고,
 * 비즈챗과는 서버끼리 "견적"과 "발송 요청" 두 가지만 주고받는다.
 * 광고 초안은 브릿지가 보관하고(src/lib/ad/draft-repository.ts), 결제가 끝난 뒤 발송 요청에 문안을 담아 보낸다.
 *
 * 전문 스펙 미정 → 기본은 MockBizchatClient. BIZCHAT_API_BASE_URL 이 있으면 HttpBizchatClient(가정 규격).
 */

/** 문자 유형. 바이트 수로 정해지고 단가가 달라진다(목업 기준) */
export type MessageType = 'SMS' | 'LMS'

export type QuoteRequest = {
  /** 견적 대상이 되는 브릿지 초안 ID */
  draftId: string
  regionName: string
  messageType: MessageType
  targetCount: number
}

export type Quote = {
  quoteId: string
  draftId: string
  targetCount: number
  unitPrice: number
  supplyAmount: number
  vat: number
  /** 결제 금액(원, VAT 포함). 브릿지는 금액을 계산하지 않고 이 값을 쓴다 */
  totalAmount: number
  expiresAt: number
}

export type SendRequest = {
  /** = 주문번호. 재시도해도 발송 접수 1건 */
  idempotencyKey: string
  quoteId: string
  draftId: string
  merchant: Pick<Merchant, 'partnerCode' | 'partnerMerchantId' | 'storeName' | 'storePhone' | 'regionName' | 'address'>
  targeting: { regionName: string; targetCount: number }
  message: { type: MessageType; title: string; body: string; bodyBytes: number }
  payment: { orderId: string; amount: number; tid: string; payMethod: string; paidAt: number }
}

export type SendResult = { sendRequestId: string; status: 'ACCEPTED' }

/**
 * retryable=false: 비즈챗이 접수를 거절한 것이 확정 → 결제 취소 대상
 * retryable=true : 접수 여부를 알 수 없음(타임아웃·5xx·429) → 취소하지 말고 같은 멱등키로 재시도
 */
export class BizchatError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'BizchatError'
  }
}

export interface BizchatClient {
  /** 지역 기준 발송 가능 대상 규모 선택지 */
  targetOptions(regionName: string): Promise<number[]>
  quote(req: QuoteRequest): Promise<Quote>
  requestSend(req: SendRequest): Promise<SendResult>
}

// ───────────────────────── 목업 ─────────────────────────

/** 목업 단가(원, VAT 별도). 실제 단가·대상 산정은 비즈챗 */
const MOCK_UNIT_PRICE: Record<MessageType, number> = { SMS: 13, LMS: 33 }
const MOCK_TARGETS = [300, 500, 1000, 2000, 3000]
const QUOTE_TTL_MS = 30 * 60_000

class MockBizchatClient implements BizchatClient {
  private readonly quotes = new Map<string, Quote>()
  private readonly sends = new Map<string, SendResult>()

  async targetOptions(_regionName: string): Promise<number[]> {
    return MOCK_TARGETS
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    if (!MOCK_TARGETS.includes(req.targetCount)) throw new BizchatError('invalid target count', false, 400)
    const unitPrice = MOCK_UNIT_PRICE[req.messageType]
    const supplyAmount = req.targetCount * unitPrice
    const vat = Math.floor(supplyAmount / 10)
    const quoteId = `Q-${createHash('sha256').update(`${req.draftId}:${req.messageType}:${req.targetCount}`).digest('hex').slice(0, 10).toUpperCase()}`
    const q: Quote = {
      quoteId,
      draftId: req.draftId,
      targetCount: req.targetCount,
      unitPrice,
      supplyAmount,
      vat,
      totalAmount: supplyAmount + vat,
      expiresAt: Date.now() + QUOTE_TTL_MS,
    }
    this.quotes.set(quoteId, q)
    return q
  }

  async requestSend(req: SendRequest): Promise<SendResult> {
    await new Promise((r) => setTimeout(r, 300))
    const mode = process.env.BIZCHAT_MOCK_SEND
    if (mode === 'reject') throw new BizchatError('mock send rejected', false, 422)
    if (mode === 'timeout') throw new BizchatError('mock send timeout', true)
    const hit = this.sends.get(req.idempotencyKey)
    if (hit) return hit
    const q = this.quotes.get(req.quoteId)
    if (!q || q.draftId !== req.draftId || q.totalAmount !== req.payment.amount || q.targetCount !== req.targeting.targetCount) {
      throw new BizchatError('quote mismatch', false, 409)
    }
    const r: SendResult = { sendRequestId: `SEND-${req.idempotencyKey.slice(-10)}`, status: 'ACCEPTED' }
    this.sends.set(req.idempotencyKey, r)
    return r
  }
}

// ───────────────────────── HTTP (가정 규격) ─────────────────────────

/**
 * 비즈챗 전문이 나오면 경로·필드·인증만 맞추면 되도록 골격을 둔다.
 * 지금 경로(/v1/targets, /v1/quotes, /v1/sends)와 Bearer 인증은 가정이다.
 * 바꾸면 안 되는 것: 오류를 "확정 거절 / 결과 불명"으로 나누는 규칙(classify). 결제 취소 여부가 여기서 갈린다.
 */
class HttpBizchatClient implements BizchatClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async targetOptions(regionName: string): Promise<number[]> {
    const r = await this.call<{ options: number[] }>('GET', `/v1/targets?region=${encodeURIComponent(regionName)}`)
    if (!Array.isArray(r.options) || !r.options.every((n) => Number.isSafeInteger(n) && n > 0)) {
      throw new BizchatError('invalid targets response', true)
    }
    return r.options
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    const q = await this.call<Quote>('POST', '/v1/quotes', req)
    if (!Number.isSafeInteger(q.totalAmount) || q.targetCount !== req.targetCount) throw new BizchatError('invalid quote response', true)
    return q
  }

  async requestSend(req: SendRequest): Promise<SendResult> {
    const r = await this.call<SendResult>('POST', '/v1/sends', req, req.idempotencyKey)
    if (!r.sendRequestId) throw new BizchatError('invalid send response', true)
    return r
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      })
    } catch (e) {
      // 요청이 나갔는지 알 수 없다
      throw new BizchatError(e instanceof Error ? e.name : 'fetch_failed', true)
    }
    if (!res.ok) throw classify(res.status)
    try {
      return (await res.json()) as T
    } catch {
      // 2xx 인데 본문을 못 읽음: 처리됐을 수 있다
      throw new BizchatError('unparsable response', true, res.status)
    }
  }
}

/** 408·429·5xx 는 결과 불명(재시도), 그 외 4xx 는 확정 거절 */
export function classify(status: number): BizchatError {
  const retryable = status === 408 || status === 429 || status >= 500
  return new BizchatError(`HTTP ${status}`, retryable, status)
}

const g = globalThis as typeof globalThis & { __bizchatClient?: BizchatClient }

export function getBizchatClient(): BizchatClient {
  if (g.__bizchatClient) return g.__bizchatClient
  const base = process.env.BIZCHAT_API_BASE_URL?.trim()
  const key = process.env.BIZCHAT_API_KEY?.trim()
  if (base) {
    if (!key) throw new Error('BIZCHAT_API_KEY is not configured')
    if (!base.startsWith('https://') && process.env.NODE_ENV === 'production') throw new Error('BIZCHAT_API_BASE_URL must be https')
    return (g.__bizchatClient = new HttpBizchatClient(base.replace(/\/$/, ''), key))
  }
  return (g.__bizchatClient = new MockBizchatClient())
}
