export type SlotKey =
  | 'storeName'
  | 'regionName'
  | 'storePhone'
  | 'address'
  | 'storeIntro'
  | 'mainItems'
  | 'businessHours'
  | 'newItemName'
  | 'newItemDesc'
  | 'launchDate'
  | 'participation'
  | 'benefit'
  | 'eventEndDate'
  | 'serviceArea'
  | 'capability'
  | 'linkUrl'

export type SlotKind = 'text' | 'multiline' | 'tel' | 'date' | 'url'

/** 파트너 정보로 미리 채울 수 있는 슬롯 */
export type PrefillField = 'storeName' | 'regionName' | 'storePhone' | 'address'

export type SlotDef = {
  label: string
  kind: SlotKind
  maxLength: number
  placeholder?: string
  prefill?: PrefillField
}

export const SLOT_DEFS: Record<SlotKey, SlotDef> = {
  storeName: { label: '가게명', kind: 'text', maxLength: 30, prefill: 'storeName' },
  regionName: { label: '동네명', kind: 'text', maxLength: 15, prefill: 'regionName', placeholder: '예) 역삼동' },
  storePhone: { label: '가게 전화번호', kind: 'tel', maxLength: 13, prefill: 'storePhone', placeholder: '예) 02-1234-5678' },
  address: { label: '가게 주소', kind: 'text', maxLength: 80, prefill: 'address' },
  storeIntro: { label: '가게 소개', kind: 'multiline', maxLength: 200, placeholder: '우리 가게를 한두 문장으로 소개해 주세요' },
  mainItems: { label: '대표 메뉴', kind: 'text', maxLength: 60 },
  businessHours: { label: '영업 시간', kind: 'text', maxLength: 40, placeholder: '예) 매일 11:00~21:00' },
  newItemName: { label: '신메뉴 이름', kind: 'text', maxLength: 40 },
  newItemDesc: { label: '신메뉴 소개', kind: 'multiline', maxLength: 200 },
  launchDate: { label: '출시 날짜', kind: 'date', maxLength: 10 },
  participation: { label: '참여 방법', kind: 'text', maxLength: 80, placeholder: '예) 방문 시 문자 제시' },
  benefit: { label: '제공 혜택', kind: 'text', maxLength: 80, placeholder: '예) 전 메뉴 10% 할인' },
  eventEndDate: { label: '이벤트 종료 날짜', kind: 'date', maxLength: 10 },
  serviceArea: { label: '서비스 가능 지역', kind: 'text', maxLength: 60, placeholder: '예) 서울 전 지역' },
  capability: { label: '주요 설비·역량', kind: 'multiline', maxLength: 200 },
  linkUrl: { label: '링크 주소', kind: 'url', maxLength: 200, placeholder: 'https://' },
}
