import { redirect } from 'next/navigation'
import { readSession } from '@/lib/bridge/session'
import { getBizchatClient } from '@/lib/bizchat/client'
import { orderRepo } from '@/lib/order/repository'
import Notice from '../Notice'
import SendForm, { type QuoteView } from './SendForm'

export const dynamic = 'force-dynamic'

export default async function SendPage() {
  const session = await readSession()
  if (!session) return <Notice title="입력 시간이 지났어요" body="캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요." />
  if (!session.handoff) redirect('/bridge')

  const charged = await orderRepo.findChargedByDraft(session.handoff.draftId)
  if (charged) redirect(`/bridge/pay/result/${charged.id}`)

  const bizchat = getBizchatClient()
  const options = await bizchat.targetOptions(session.handoff.draftId)
  // 화면 표시용 견적. 결제 금액은 결제 준비 시점에 서버가 다시 받는다
  const quotes: QuoteView[] = await Promise.all(
    options.map(async (n) => {
      const q = await bizchat.quote({ draftId: session.handoff!.draftId, targetCount: n })
      return { targetCount: n, unitPrice: q.unitPrice, supplyAmount: q.supplyAmount, vat: q.vat, totalAmount: q.totalAmount }
    }),
  )

  return (
    <SendForm
      storeName={session.merchant.storeName}
      regionName={session.merchant.regionName}
      templateLabel={session.handoff.templateLabel}
      quotes={quotes}
    />
  )
}
