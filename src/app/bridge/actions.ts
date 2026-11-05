'use server'

import { redirect } from 'next/navigation'
import { audit } from '@/lib/audit'
import { readSession, writeSession } from '@/lib/bridge/session'
import { getTemplateSet } from '@/lib/ad/templates'
import { LMS_MAX_BYTES, TITLE_MAX_BYTES, renderMessage, slotsOf } from '@/lib/ad/render'
import { validateValues } from '@/lib/ad/validate'
import type { SlotKey } from '@/lib/ad/slots'
import { adDraftRepo, messageTypeOf } from '@/lib/ad/draft-repository'
import { orderRepo } from '@/lib/order/repository'

export type SubmitState = {
  formError?: string
  fieldErrors?: Partial<Record<SlotKey, string>>
} | null

const MAX_VALUES_JSON = 16 * 1024

export async function submitAd(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const session = await readSession()
  if (!session) return { formError: '입력 시간이 지났어요. 캐시노트에서 배너를 다시 눌러 주세요.' }
  // 이미 결제된 초안이 있으면 문안을 바꾸지 않는다(결제 금액·발송 내용 불일치 방지)
  if (session.draft && (await orderRepo.findChargedByDraft(session.draft.draftId))) redirect('/bridge/send')

  const templateId = String(formData.get('templateId') ?? '')
  const tpl = getTemplateSet(session.merchant.industry).templates.find((t) => t.id === templateId)
  if (!tpl) return { formError: '메시지 유형을 선택해 주세요.' }

  const includeLink = formData.get('includeLink') === '1'
  const rawJson = String(formData.get('values') ?? '{}')
  if (rawJson.length > MAX_VALUES_JSON) return { formError: '입력 내용이 너무 길어요.' }

  let raw: unknown
  try {
    raw = JSON.parse(rawJson)
  } catch {
    return { formError: '입력 내용을 다시 확인해 주세요.' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { formError: '입력 내용을 다시 확인해 주세요.' }

  const checked = validateValues(slotsOf(tpl, includeLink), raw as Record<string, unknown>)
  if (!checked.ok) return { fieldErrors: checked.errors, formError: '빨간색 항목을 모두 채워 주세요.' }

  // 최종 문구는 클라이언트 미리보기가 아니라 서버에서 다시 만든다
  const msg = renderMessage(tpl, checked.values, includeLink)
  if (msg.titleBytes > TITLE_MAX_BYTES) return { formError: `제목이 너무 길어요. (${msg.titleBytes}/${TITLE_MAX_BYTES}byte)` }
  if (msg.bodyBytes > LMS_MAX_BYTES) return { formError: `메시지가 너무 길어요. (${msg.bodyBytes}/${LMS_MAX_BYTES}byte)` }

  const draft = await adDraftRepo.create({
    sid: session.sid,
    merchant: session.merchant,
    templateId: tpl.id,
    templateLabel: tpl.label,
    includeLink,
    values: checked.values,
    message: { type: messageTypeOf(msg.bodyBytes), title: msg.title, body: msg.body, bodyBytes: msg.bodyBytes },
  })

  await writeSession({ ...session, draft: { draftId: draft.id, templateLabel: tpl.label, at: Date.now() } })
  audit('bridge.draft.saved', {
    sid: session.sid,
    partnerMerchantId: session.merchant.partnerMerchantId,
    draftId: draft.id,
    templateId: tpl.id,
    messageType: draft.message.type,
    bodyBytes: msg.bodyBytes,
    // 파트너 원본과 사용자가 고친 가게명이 다르면 추적
    storeNameEdited: checked.values.storeName !== undefined && checked.values.storeName !== session.merchant.storeName,
  })
  redirect('/bridge/send')
}
