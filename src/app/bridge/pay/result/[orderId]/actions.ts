'use server'

import { redirect } from 'next/navigation'
import { readSession } from '@/lib/bridge/session'
import { isDevToolsEnabled } from '@/lib/env'
import { auditWarn } from '@/lib/audit'
import { getFirstPayConfig } from '@/lib/firstpay/config'
import { vactNotiHash } from '@/lib/firstpay/hash'
import { VACT_DEPOSITED, orderTimestamp } from '@/lib/firstpay/types'
import { orderRepo } from '@/lib/order/repository'
import { ORDER_ID_RE, reconcile } from '@/lib/order/service'

/** 보류(승인/발송 무응답)·입금 대기 건 다시 확인. 본인 세션의 주문만 */
export async function recheck(orderId: string): Promise<void> {
  if (!ORDER_ID_RE.test(orderId)) return
  const [session, order] = await Promise.all([readSession(), orderRepo.get(orderId)])
  if (!session || !order || order.sid !== session.sid) return
  await reconcile(orderId)
  redirect(`/bridge/pay/result/${orderId}`)
}

/**
 * [개발·로컬 전용] 가상계좌 입금통보 흉내. 결제서버가 보낼 form 을 같은 규격(MxHASH256 포함)으로 만들어
 * 우리 /bridge/pay/vact-noti 에 실제 HTTP 로 보낸다. 로컬은 결제서버 통보를 받을 수 없어서 쓴다.
 */
export async function simulateDeposit(orderId: string): Promise<void> {
  if (!isDevToolsEnabled() || !ORDER_ID_RE.test(orderId)) return
  const [session, order] = await Promise.all([readSession(), orderRepo.get(orderId)])
  if (!session || !order || order.sid !== session.sid || order.status !== 'WAITING_DEPOSIT') return
  const { mxId, passKey } = getFirstPayConfig()
  const body = new URLSearchParams({
    MxID: mxId, PayMethod: 'VA', Currency: 'KRW', MxIssueNO: order.id, MxIssueDate: order.issuedAt, Amount: String(order.amount),
    ReplyCode: VACT_DEPOSITED, ReplyMessage: '입금 완료(시뮬레이션)', VactNo: order.vactNo ?? '', TID: order.tid ?? '', AuthDate: orderTimestamp(),
    MxHASH256: vactNotiHash(mxId, passKey, order.id, order.issuedAt, order.amount, 'KRW'),
  })
  const base = process.env.INTERNAL_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? '3000'}`
  try {
    const res = await fetch(`${base}/bridge/pay/vact-noti`, { method: 'POST', body, cache: 'no-store', signal: AbortSignal.timeout(15_000) })
    const text = await res.text()
    if (text !== 'ACK=200OKOK') auditWarn('dev.simulate_deposit_nack', { orderId, ack: text.slice(0, 40) })
  } catch (e) {
    auditWarn('dev.simulate_deposit_error', { orderId, error: e instanceof Error ? e.message : 'unknown' })
  }
  redirect(`/bridge/pay/result/${orderId}`)
}
