import { redirect } from 'next/navigation'
import { readSession } from '@/lib/bridge/session'
import { getBizchatClient } from '@/lib/bizchat/client'
import { orderRepo } from '@/lib/order/repository'
import { adDraftRepo } from '@/lib/ad/draft-repository'
import { auditWarn } from '@/lib/audit'
import Notice from '../Notice'
import SendForm, { type QuoteView } from './SendForm'

export const dynamic = 'force-dynamic'

export default async function SendPage() {
  const session = await readSession()
  if (!session) return <Notice title="입력 시간이 지났어요" body="캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요." />
  if (!session.draft) redirect('/bridge')

  const charged = await orderRepo.findChargedByDraft(session.draft.draftId)
  if (charged) redirect(`/bridge/pay/result/${charged.id}`)

  const draft = await adDraftRepo.get(session.draft.draftId)
  if (!draft || draft.sid !== session.sid) redirect('/bridge')

  // 화면 표시용 견적(서버 간 API). 결제 금액은 결제 준비 시점에 서버가 다시 받는다
  let quotes: QuoteView[]
  try {
    const bizchat = getBizchatClient()
    const options = await bizchat.targetOptions(draft.merchant.regionName)
    quotes = await Promise.all(
      options.map(async (n) => {
        const q = await bizchat.quote({ draftId: draft.id, regionName: draft.merchant.regionName, messageType: draft.message.type, targetCount: n })
        return { targetCount: n, unitPrice: q.unitPrice, supplyAmount: q.supplyAmount, vat: q.vat, totalAmount: q.totalAmount }
      }),
    )
  } catch (e) {
    auditWarn('bridge.quote_failed', { sid: session.sid, error: e instanceof Error ? e.message : 'unknown' })
    return <Notice title="발송 금액을 불러오지 못했어요" body="잠시 후 다시 시도해 주세요." />
  }

  return (
    <SendForm
      storeName={session.merchant.storeName}
      regionName={session.merchant.regionName}
      templateLabel={session.draft.templateLabel}
      messageType={draft.message.type}
      quotes={quotes}
    />
  )
}
