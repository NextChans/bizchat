import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { audit, auditWarn } from '@/lib/audit'
import { getPartnerSecret, isSignatureEnforced } from '@/lib/env'
import { nonceStore } from '@/lib/bridge/nonce-store'
import { entrySchema, toMerchant } from '@/lib/bridge/schema'
import { SESSION_COOKIE, sealSession, sessionCookieOptions } from '@/lib/bridge/session'
import { SESSION_TTL_SEC } from '@/lib/bridge/session-crypto'
import { SIGNED_FIELDS, TIMESTAMP_TOLERANCE_SEC, verify, type SignedFields } from '@/lib/bridge/signature'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 8 * 1024

/** 오류 사유는 화면에 그대로 노출하지 않고 코드만 넘긴다 */
function fail(code: string, detail?: string): NextResponse {
  auditWarn('bridge.entry.rejected', { code, detail })
  return new NextResponse(null, { status: 303, headers: { Location: `/bridge/error?code=${code}` } })
}

/**
 * 파트너(캐시노트) 배너 클릭 → 브라우저 form POST 로 진입.
 * 서명 검증 → 정규화 → nonce 소비 → 암호화 세션 쿠키 → 303 GET /bridge (PRG: 새로고침 재전송 방지)
 */
export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(ct)) return fail('invalid_request', 'content_type')
  const len = Number(req.headers.get('content-length') ?? '0')
  if (len > MAX_BODY_BYTES) return fail('invalid_request', 'too_large')

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('invalid_request', 'unparsable')
  }

  const raw: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') raw[k] = v
  if (JSON.stringify(raw).length > MAX_BODY_BYTES) return fail('invalid_request', 'too_large')

  const partnerCode = raw.partnerCode ?? ''
  const secret = getPartnerSecret(partnerCode)
  if (!secret) return fail('unknown_partner', partnerCode.slice(0, 20))

  // 서명은 정규화 "전" 원문으로 검증한다
  if (isSignatureEnforced()) {
    const signed: SignedFields = Object.fromEntries(SIGNED_FIELDS.map((k) => [k, raw[k] ?? '']))
    const v = verify(signed, raw.signature, secret)
    if (!v.ok) return fail(v.reason === 'stale_timestamp' ? 'expired' : 'bad_signature', v.reason)
  }

  const parsed = entrySchema.safeParse(raw)
  if (!parsed.success) {
    return fail('invalid_request', parsed.error.issues.map((i) => i.path.join('.')).join(',').slice(0, 200))
  }

  const fresh = await nonceStore.consume(`${partnerCode}:${parsed.data.nonce}`, TIMESTAMP_TOLERANCE_SEC * 2)
  if (!fresh) return fail('replay')

  const merchant = toMerchant(parsed.data)
  const now = Math.floor(Date.now() / 1000)
  const sid = randomUUID()

  audit('bridge.entry.accepted', {
    sid,
    partnerCode: merchant.partnerCode,
    partnerMerchantId: merchant.partnerMerchantId,
    industry: merchant.industry,
    categoryMain: merchant.categoryMain,
    hasPhone: Boolean(merchant.storePhone),
    hasAddress: Boolean(merchant.address),
  })

  const res = new NextResponse(null, { status: 303, headers: { Location: '/bridge' } })
  res.cookies.set(SESSION_COOKIE, sealSession({ v: 1, sid, merchant, iat: now, exp: now + SESSION_TTL_SEC }), sessionCookieOptions)
  return res
}

export function GET() {
  return fail('invalid_request', 'method_get')
}
