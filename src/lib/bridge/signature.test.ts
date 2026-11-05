import { describe, expect, it } from 'vitest'
import { canonicalize, sign, verify, type SignedFields } from './signature'

const SECRET = 'test-secret'
const now = 1_790_000_000
const base: SignedFields = {
  partnerCode: 'cashnote',
  partnerMerchantId: 'CN_1',
  storeName: '역삼 손칼국수 & 만두',
  categoryMain: '음식점업',
  timestamp: String(now),
  nonce: 'abcdefghijklmnop',
}

describe('signature', () => {
  it('누락 필드도 빈 값으로 자리를 지킨다', () => {
    expect(canonicalize(base)).toContain('categorySub=&address=&')
  })
  it('정상 서명 통과', () => {
    expect(verify(base, sign(base, SECRET), SECRET, now)).toEqual({ ok: true })
  })
  it('값 변조 거부', () => {
    const sig = sign(base, SECRET)
    expect(verify({ ...base, storeName: '다른가게' }, sig, SECRET, now)).toEqual({ ok: false, reason: 'bad_signature' })
  })
  it('필드 경계 이동(값에 & = 삽입) 거부', () => {
    const a = { ...base, storeName: 'A', categoryMain: 'B' }
    const b = { ...base, storeName: 'A&categoryMain=B', categoryMain: '' }
    expect(canonicalize(a)).not.toBe(canonicalize(b))
  })
  it('타임스탬프 5분 초과 거부', () => {
    expect(verify(base, sign(base, SECRET), SECRET, now + 301)).toEqual({ ok: false, reason: 'stale_timestamp' })
  })
  it('형식이 아닌 서명 거부(길이 다른 버퍼로 timingSafeEqual 예외 없음)', () => {
    expect(verify(base, 'abc', SECRET, now)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verify(base, undefined, SECRET, now)).toEqual({ ok: false, reason: 'missing_signature' })
  })
})
