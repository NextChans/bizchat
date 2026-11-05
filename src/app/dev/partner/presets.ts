/** 목업 파트너 페이지 프리셋. 실제 가맹점 정보가 아니다. */
export const PRESETS = [
  {
    id: 'food',
    label: '외식업',
    fields: {
      partnerMerchantId: 'CN_M_000123',
      storeName: '역삼 손칼국수',
      categoryMain: '음식점업',
      categorySub: '한식 면요리 전문점',
      address: '서울특별시 강남구 테헤란로 123 (역삼동)',
      regionName: '',
      storePhone: '0212345678',
    },
  },
  {
    id: 'construction',
    label: '건설업',
    fields: {
      partnerMerchantId: 'CN_M_000456',
      storeName: '바른인테리어',
      categoryMain: '건설업',
      categorySub: '실내 건축 및 건축마무리 공사업',
      address: '경기도 성남시 분당구 정자동 178-1',
      regionName: '정자동',
      storePhone: '010-2345-6789',
    },
  },
  {
    id: 'manufacturing',
    label: '제조업',
    fields: {
      partnerMerchantId: 'CN_M_000789',
      storeName: '한빛정밀',
      categoryMain: '제조업',
      categorySub: '금속 가공제품 제조업',
      address: '인천광역시 남동구 남동서로 200 (고잔동)',
      regionName: '',
      storePhone: '032-812-3456',
    },
  },
] as const

export const FIELD_LABELS = {
  partnerMerchantId: '파트너 가맹점 ID',
  storeName: '상호명',
  categoryMain: '업종 대분류',
  categorySub: '업종 소분류',
  address: '사업장 주소',
  regionName: '동네명(없으면 주소에서 추출)',
  storePhone: '가게 연락처',
} as const
