import 'server-only'
import { randomBytes } from 'node:crypto'
import type { MessageType } from '../bizchat/client'
import type { Merchant } from '../bridge/merchant'
import type { SlotValues } from './render'

/**
 * 광고 초안. 비즈챗에는 화면이 없으므로 초안은 브릿지가 보관하고,
 * 결제가 끝난 뒤 발송 요청에 문안을 담아 비즈챗으로 보낸다(결제 전에는 비즈챗에 아무것도 만들지 않음).
 * 서버에서 렌더링·검증한 최종 문안만 저장한다.
 *
 * 목업: 인스턴스 메모리. 운영: docs/schema.sql 의 ad_drafts.
 */
export type AdDraft = {
  id: string
  sid: string
  /** 파트너가 서명해 넘긴 가맹점 정보(사용자 수정 전 원본) */
  merchant: Merchant
  templateId: string
  templateLabel: string
  includeLink: boolean
  values: SlotValues
  message: { type: MessageType; title: string; body: string; bodyBytes: number }
  createdAt: number
}

export interface AdDraftRepository {
  create(d: Omit<AdDraft, 'id' | 'createdAt'>): Promise<AdDraft>
  get(id: string): Promise<AdDraft | null>
}

/** 90byte 이하는 SMS(제목 없음), 넘으면 LMS */
export const SMS_MAX_BYTES = 90
export const messageTypeOf = (bodyBytes: number): MessageType => (bodyBytes <= SMS_MAX_BYTES ? 'SMS' : 'LMS')

class InMemoryAdDraftRepository implements AdDraftRepository {
  private readonly drafts = new Map<string, AdDraft>()

  async create(d: Omit<AdDraft, 'id' | 'createdAt'>) {
    const draft: AdDraft = { ...d, id: `AD${randomBytes(9).toString('base64url')}`, createdAt: Date.now() }
    this.drafts.set(draft.id, draft)
    return structuredClone(draft)
  }

  async get(id: string) {
    const d = this.drafts.get(id)
    return d ? structuredClone(d) : null
  }
}

const g = globalThis as typeof globalThis & { __adDraftRepo?: AdDraftRepository }
export const adDraftRepo: AdDraftRepository = (g.__adDraftRepo ??= new InMemoryAdDraftRepository())
