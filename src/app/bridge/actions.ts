'use server'

import { redirect } from 'next/navigation'
import { audit, auditWarn } from '@/lib/audit'
import { readSession, writeSession } from '@/lib/bridge/session'
import { getTemplateSet } from '@/lib/ad/templates'
import { LMS_MAX_BYTES, TITLE_MAX_BYTES, renderMessage, slotsOf } from '@/lib/ad/render'
import { validateValues } from '@/lib/ad/validate'
import type { SlotKey } from '@/lib/ad/slots'
import { BizchatError, getBizchatClient } from '@/lib/bizchat/client'

export type SubmitState = {
  formError?: string
  fieldErrors?: Partial<Record<SlotKey, string>>
} | null

const MAX_VALUES_JSON = 16 * 1024

export async function submitAd(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const session = await readSession()
  if (!session) return { formError: '입력 시간이 지났어요. 캐시노트에서 배너를 다시 눌러 주세요.' }
  // 이미 전달된 세션(중복 클릭·뒤로가기 재제출)은 새로 만들지 않는다
  if (session.handoff) redirect('/bridge/done')

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

  let result
  try {
    result = await getBizchatClient().createAdDraft({
      idempotencyKey: session.sid,
      merchant: session.merchant,
      templateId: tpl.id,
      includeLink,
      values: checked.values,
      message: { title: msg.title, body: msg.body, bodyBytes: msg.bodyBytes },
    })
  } catch (e) {
    auditWarn('bridge.handoff.failed', {
      sid: session.sid,
      retryable: e instanceof BizchatError ? e.retryable : null,
      error: e instanceof Error ? e.message : 'unknown',
    })
    return { formError: '비즈챗으로 전달하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }

  await writeSession({
    ...session,
    handoff: { draftId: result.draftId, templateLabel: tpl.label, redirectUrl: result.redirectUrl, at: Date.now() },
  })
  audit('bridge.handoff.succeeded', {
    sid: session.sid,
    partnerMerchantId: session.merchant.partnerMerchantId,
    draftId: result.draftId,
    templateId: tpl.id,
    bodyBytes: msg.bodyBytes,
    // 파트너 원본과 사용자가 고친 가게명이 다르면 추적
    storeNameEdited: checked.values.storeName !== undefined && checked.values.storeName !== session.merchant.storeName,
  })
  redirect('/bridge/done')
}
