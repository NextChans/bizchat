import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * 서명 대상 필드와 순서(목업 규격). 파트너와 확정 시 이 배열이 곧 규격이다.
 * 빠진 선택 필드도 빈 문자열로 자리를 지켜, 필드 삭제로 서명을 우회하지 못하게 한다.
 */
export const SIGNED_FIELDS = [
  'partnerCode',
  'partnerMerchantId',
  'storeName',
  'categoryMain',
  'categorySub',
  'address',
  'regionName',
  'storePhone',
  'timestamp',
  'nonce',
] as const

export type SignedField = (typeof SIGNED_FIELDS)[number]
export type SignedFields = Partial<Record<SignedField, string>>

export const TIMESTAMP_TOLERANCE_SEC = 300

export function canonicalize(fields: SignedFields): string {
  return SIGNED_FIELDS.map((k) => `${k}=${encodeURIComponent(fields[k] ?? '')}`).join('&')
}

export function sign(fields: SignedFields, secret: string): string {
  return createHmac('sha256', secret).update(canonicalize(fields), 'utf8').digest('hex')
}

export type VerifyFailure = 'missing_signature' | 'bad_timestamp' | 'stale_timestamp' | 'bad_signature'
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure }

export function verify(
  fields: SignedFields,
  signature: string | undefined,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!signature) return { ok: false, reason: 'missing_signature' }
  const ts = Number(fields.timestamp)
  if (!Number.isInteger(ts)) return { ok: false, reason: 'bad_timestamp' }
  if (Math.abs(nowSec - ts) > TIMESTAMP_TOLERANCE_SEC) return { ok: false, reason: 'stale_timestamp' }
  if (!/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'bad_signature' }
  const expected = Buffer.from(sign(fields, secret), 'hex')
  const given = Buffer.from(signature, 'hex')
  return timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: 'bad_signature' }
}
