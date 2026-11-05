import { describe, expect, it } from 'vitest'
import { entrySchema, toMerchant } from './schema'
import { classifyIndustry } from './industry'
import { deriveRegionName, normalizePhone } from '../text'

const raw = {
  partnerCode: 'cashnote',
  partnerMerchantId: 'CN_M_1',
  storeName: '  역삼​ 손칼국수‮  ',
  categoryMain: '음식점업',
  address: '서울특별시 강남구 테헤란로 123 (역삼동)',
  storePhone: '0212345678',
  timestamp: '1790000000',
  nonce: 'abcdefghijklmnop',
}

describe('entry schema', () => {
  it('정규화: 제로폭/양방향 제어문자 제거, 전화번호 포맷, 동네명 추출', () => {
    const m = toMerchant(entrySchema.parse(raw))
    expect(m.storeName).toBe('역삼 손칼국수')
    expect(m.storePhone).toBe('02-1234-5678')
    expect(m.regionName).toBe('역삼동')
    expect(m.industry).toBe('food')
  })
  it('미등록 파트너 / 잘못된 전화번호 거부', () => {
    expect(entrySchema.safeParse({ ...raw, partnerCode: 'evil' }).success).toBe(false)
    expect(entrySchema.safeParse({ ...raw, storePhone: '12345' }).success).toBe(false)
  })
})

describe('industry', () => {
  it.each([
    ['건설업', '실내 건축 및 건축마무리 공사업', 'construction'],
    ['제조업', '식료품 제조업', 'manufacturing'],
    ['음식점업', '제과점업', 'food'],
    ['도매 및 소매업', '', 'general'],
  ])('%s / %s → %s', (a, b, k) => expect(classifyIndustry(a, b)).toBe(k))
})

describe('text', () => {
  it.each([
    ['경기도 성남시 분당구 정자동 178-1', '정자동'],
    ['서울 종로구 종로1가 1', '종로1가'],
    ['서울 중구 세종대로 110', '중구'],
  ])('deriveRegionName(%s)', (a, r) => expect(deriveRegionName(a)).toBe(r))
  it.each([
    ['01023456789', '010-2345-6789'],
    ['031-123-4567', '031-123-4567'],
    ['15881234', '1588-1234'],
    ['abc', null],
  ])('normalizePhone(%s)', (a, r) => expect(normalizePhone(a)).toBe(r))
})
