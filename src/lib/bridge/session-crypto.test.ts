import { describe, expect, it } from 'vitest'
import { seal, unseal, type BridgeSession } from './session-crypto'

const s: BridgeSession = {
  v: 1,
  sid: 'sid-1',
  iat: 100,
  exp: 200,
  merchant: {
    partnerCode: 'cashnote', partnerMerchantId: 'CN_1', storeName: '가게', categoryMain: '음식점업', categorySub: '',
    address: '', regionName: '역삼동', storePhone: '02-1234-5678', industry: 'food',
  },
}

describe('session-crypto', () => {
  it('왕복', () => expect(unseal(seal(s, 'k'.repeat(32)), 'k'.repeat(32), 150)).toEqual(s))
  it('만료 거부', () => expect(unseal(seal(s, 'k'.repeat(32)), 'k'.repeat(32), 200)).toBeNull())
  it('다른 키 거부', () => expect(unseal(seal(s, 'k'.repeat(32)), 'x'.repeat(32), 150)).toBeNull())
  it('암호문 변조 거부', () => {
    const [v, iv, ct, tag] = seal(s, 'k'.repeat(32)).split('.')
    const flipped = Buffer.from(ct!, 'base64url')
    flipped[0]! ^= 1
    expect(unseal([v, iv, flipped.toString('base64url'), tag].join('.'), 'k'.repeat(32), 150)).toBeNull()
  })
  it('평문이 쿠키에 드러나지 않음', () => expect(seal(s, 'k'.repeat(32))).not.toContain('CN_1'))
})
