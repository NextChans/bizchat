export type IndustryKey = 'food' | 'construction' | 'manufacturing' | 'general'

export const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  food: '외식업',
  construction: '건설업',
  manufacturing: '제조업',
  general: '일반',
}

// 순서가 우선순위다. "식료품 제조업" 은 제조, "제과점업" 은 외식으로 분류되도록 제조를 먼저 본다.
const RULES: ReadonlyArray<readonly [IndustryKey, RegExp]> = [
  ['construction', /건설|건축|인테리어|시공|토목|설비|공사|도장|방수|철거/],
  ['manufacturing', /제조|공장|생산|가공|금형|주조/],
  ['food', /음식|외식|식당|카페|커피|주점|베이커리|제과|요식|한식|중식|일식|양식|분식|치킨|피자|주점/],
]

/**
 * 파트너가 주는 대분류/소분류 문자열 → 내부 템플릿 업종.
 * 파트너 업종 코드 체계(KSIC 여부 등)가 확정되면 코드 매핑으로 교체한다.
 */
export function classifyIndustry(categoryMain: string, categorySub: string): IndustryKey {
  const text = `${categoryMain} ${categorySub}`
  return RULES.find(([, re]) => re.test(text))?.[0] ?? 'general'
}
