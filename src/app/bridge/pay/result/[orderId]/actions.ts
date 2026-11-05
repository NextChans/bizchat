'use server'

import { redirect } from 'next/navigation'
import { readSession } from '@/lib/bridge/session'
import { orderRepo } from '@/lib/order/repository'
import { ORDER_ID_RE, reconcile } from '@/lib/order/service'

/** 보류(승인/발송 무응답) 건 다시 확인. 본인 세션의 주문만 */
export async function recheck(orderId: string): Promise<void> {
  if (!ORDER_ID_RE.test(orderId)) return
  const [session, order] = await Promise.all([readSession(), orderRepo.get(orderId)])
  if (!session || !order || order.sid !== session.sid) return
  await reconcile(orderId)
  redirect(`/bridge/pay/result/${orderId}`)
}
