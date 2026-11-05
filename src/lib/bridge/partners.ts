/** 진입을 허용하는 파트너. 코드는 POST 의 partnerCode, 비밀키는 env.getPartnerSecret 에서 관리 */
export const PARTNERS = {
  cashnote: { name: '캐시노트' },
} as const

export type PartnerCode = keyof typeof PARTNERS
export const PARTNER_CODES = Object.keys(PARTNERS) as [PartnerCode, ...PartnerCode[]]
