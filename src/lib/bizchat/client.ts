import 'server-only'
import { createHash } from 'node:crypto'
import type { Merchant } from '../bridge/merchant'
import type { SlotValues } from '../ad/render'

/**
 * 비즈챗 연동 인터페이스(목업). 전문 스펙 확정 시 HttpBizchatClient 를 구현해 교체한다.
 *
 * 실연동 시 지킬 것
 * - Idempotency-Key 헤더로 idempotencyKey 전달 → 재시도/중복 클릭에도 초안 1건
 * - AbortSignal.timeout(3~5s), 재시도는 멱등키가 있을 때 5xx/네트워크 오류만 1회
 * - 응답 redirectUrl 은 비즈챗 도메인 allowlist 검증 후에만 이동(오픈 리다이렉트 방지)
 */
export type AdDraftRequest = {
  idempotencyKey: string
  /** 파트너가 서명한 원본 가맹점 정보 */
  merchant: Merchant
  templateId: string
  includeLink: boolean
  /** 사용자가 최종 입력한 값(검증·정규화 후) */
  values: SlotValues
  message: { title: string; body: string; bodyBytes: number }
}

export type AdDraftResult = {
  draftId: string
  status: 'DRAFT_CREATED'
  /** 비즈챗 쪽 이어서 진행할 화면. 목업은 null */
  redirectUrl: string | null
}

export class BizchatError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'BizchatError'
  }
}

/** 발송 대상 규모별 견적. 금액은 비즈챗이 정한다(브릿지는 계산하지 않음) */
export type QuoteRequest = { draftId: string; targetCount: number }
export type Quote = {
  quoteId: string
  draftId: string
  targetCount: number
  unitPrice: number
  supplyAmount: number
  vat: number
  /** 결제 금액(원, VAT 포함) */
  totalAmount: number
  expiresAt: number
}

export type SendRequest = {
  /** = 주문번호. 재시도해도 발송 1회 */
  idempotencyKey: string
  draftId: string
  quoteId: string
  targetCount: number
  payment: { orderId: string; amount: number; tid: string; payMethod: string; paidAt: number }
}
export type SendResult = { sendRequestId: string; status: 'ACCEPTED' }

export interface BizchatClient {
  createAdDraft(req: AdDraftRequest): Promise<AdDraftResult>
  /** 초안 기준 발송 가능 대상 규모 선택지 */
  targetOptions(draftId: string): Promise<number[]>
  quote(req: QuoteRequest): Promise<Quote>
  /**
   * 결제 완료 후 발송 요청.
   * BizchatError(retryable=false): 접수 거절이 확정 → 결제 취소
   * BizchatError(retryable=true)·타임아웃: 접수 여부 불명 → 같은 멱등키로 재시도(취소하지 않음)
   */
  requestSend(req: SendRequest): Promise<SendResult>
}

/** 목업 단가(원, VAT 별도). 실제 단가·대상 산정은 비즈챗 */
const MOCK_UNIT_PRICE = 33
const MOCK_TARGETS = [300, 500, 1000, 2000, 3000]
const QUOTE_TTL_MS = 30 * 60_000

class MockBizchatClient implements BizchatClient {
  private readonly byKey = new Map<string, AdDraftResult>()
  private readonly quotes = new Map<string, Quote>()
  private readonly sends = new Map<string, SendResult>()

  async targetOptions(_draftId: string): Promise<number[]> {
    return MOCK_TARGETS
  }

  async quote(req: QuoteRequest): Promise<Quote> {
    if (!MOCK_TARGETS.includes(req.targetCount)) throw new BizchatError('invalid target count', false)
    const supplyAmount = req.targetCount * MOCK_UNIT_PRICE
    const vat = Math.floor(supplyAmount / 10)
    const quoteId = `Q-${createHash('sha256').update(`${req.draftId}:${req.targetCount}`).digest('hex').slice(0, 10).toUpperCase()}`
    const q: Quote = {
      quoteId,
      draftId: req.draftId,
      targetCount: req.targetCount,
      unitPrice: MOCK_UNIT_PRICE,
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
    if (mode === 'reject') throw new BizchatError('mock send rejected', false)
    if (mode === 'timeout') throw new BizchatError('mock send timeout', true)
    const hit = this.sends.get(req.idempotencyKey)
    if (hit) return hit
    const q = this.quotes.get(req.quoteId)
    if (!q || q.draftId !== req.draftId || q.totalAmount !== req.payment.amount) {
      throw new BizchatError('quote mismatch', false)
    }
    const r: SendResult = { sendRequestId: `SEND-${req.idempotencyKey.slice(-10)}`, status: 'ACCEPTED' }
    this.sends.set(req.idempotencyKey, r)
    return r
  }

  async createAdDraft(req: AdDraftRequest): Promise<AdDraftResult> {
    await new Promise((r) => setTimeout(r, 300))
    if (process.env.BIZCHAT_MOCK_FAIL === 'true') throw new BizchatError('mock failure', true)

    const hit = this.byKey.get(req.idempotencyKey)
    if (hit) return hit

    const draftId = `MOCK-${createHash('sha256').update(req.idempotencyKey).digest('hex').slice(0, 12).toUpperCase()}`
    const result: AdDraftResult = { draftId, status: 'DRAFT_CREATED', redirectUrl: null }
    this.byKey.set(req.idempotencyKey, result)
    return result
  }
}

const g = globalThis as typeof globalThis & { __bizchatClient?: BizchatClient }

export function getBizchatClient(): BizchatClient {
  return (g.__bizchatClient ??= new MockBizchatClient())
}
