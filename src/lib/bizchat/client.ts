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

export interface BizchatClient {
  createAdDraft(req: AdDraftRequest): Promise<AdDraftResult>
}

class MockBizchatClient implements BizchatClient {
  private readonly byKey = new Map<string, AdDraftResult>()

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
