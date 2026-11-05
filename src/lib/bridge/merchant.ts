import type { PartnerCode } from './partners'
import type { IndustryKey } from './industry'

/** 파트너가 서명해서 넘긴 가맹점 정보(정규화 후). 사용자가 화면에서 고친 값과 구분해 보관한다. */
export type Merchant = {
  partnerCode: PartnerCode
  partnerMerchantId: string
  storeName: string
  categoryMain: string
  categorySub: string
  address: string
  regionName: string
  storePhone: string
  industry: IndustryKey
}
