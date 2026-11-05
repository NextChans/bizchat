import { readSession } from '@/lib/bridge/session'
import { getTemplateSet } from '@/lib/ad/templates'
import { INDUSTRY_LABEL } from '@/lib/bridge/industry'
import AdEditor from './AdEditor'
import Notice from './Notice'

export const dynamic = 'force-dynamic'

export default async function BridgePage() {
  const session = await readSession()
  if (!session) {
    return <Notice title="입력 시간이 지났어요" body="캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요." />
  }
  const { merchant } = session
  if (session.handoff) {
    return <Notice title="이미 비즈챗으로 전달했어요" body="새 광고를 만들려면 캐시노트 앱에서 배너를 다시 눌러 주세요." />
  }

  // 클라이언트로는 화면에 필요한 값만 넘긴다(partnerMerchantId 등 내부 식별자 제외)
  return (
    <AdEditor
      store={{
        storeName: merchant.storeName,
        regionName: merchant.regionName,
        storePhone: merchant.storePhone,
        address: merchant.address,
        category: [merchant.categoryMain, merchant.categorySub].filter(Boolean).join(' > '),
        industryLabel: INDUSTRY_LABEL[merchant.industry],
      }}
      templateSet={getTemplateSet(merchant.industry)}
    />
  )
}
