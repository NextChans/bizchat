'use server'

import { auditWarn } from '@/lib/audit'
import { readSession, writeSession } from '@/lib/bridge/session'
import { BizchatError } from '@/lib/bizchat/client'
import { orderRepo } from '@/lib/order/repository'
import { preparePayment, type GoPayParams } from '@/lib/order/service'

export type StartPaymentResult = { ok: true; pay: GoPayParams } | { ok: false; error: string; redirectTo?: string }

/** 금액은 받지 않는다. 대상 규모만 받아 서버가 비즈챗 견적으로 금액을 정한다 */
export async function startPayment(targetCount: number): Promise<StartPaymentResult> {
  const session = await readSession()
  if (!session?.handoff) return { ok: false, error: '입력 시간이 지났어요. 캐시노트에서 배너를 다시 눌러 주세요.' }
  if (!Number.isSafeInteger(targetCount)) return { ok: false, error: '발송 대상을 선택해 주세요.' }

  const charged = await orderRepo.findChargedByDraft(session.handoff.draftId)
  if (charged) return { ok: false, error: '이미 결제한 광고예요.', redirectTo: `/bridge/pay/result/${charged.id}` }

  try {
    const pay = await preparePayment(session, targetCount)
    await writeSession(session) // 결제창 왕복 동안 세션 연장
    return { ok: true, pay }
  } catch (e) {
    auditWarn('order.prepare_failed', { sid: session.sid, error: e instanceof Error ? e.message : 'unknown' })
    if (e instanceof BizchatError && !e.retryable) return { ok: false, error: '선택한 발송 대상으로는 결제할 수 없어요.' }
    return { ok: false, error: '결제를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.' }
  }
}
