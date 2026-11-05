import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getPartnerSecret, isDevToolsEnabled } from '@/lib/env'
import { SIGNED_FIELDS, sign, type SignedFields } from '@/lib/bridge/signature'

export const dynamic = 'force-dynamic'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** [개발 전용] 파트너 서버 역할: 서명한 hidden form 을 만들어 /bridge/entry 로 auto-submit */
export async function POST(req: NextRequest) {
  if (!isDevToolsEnabled()) return new NextResponse('Not Found', { status: 404 })
  const form = await req.formData()
  const get = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')

  const fields: SignedFields = {
    partnerCode: 'cashnote',
    partnerMerchantId: get('partnerMerchantId'),
    storeName: get('storeName'),
    categoryMain: get('categoryMain'),
    categorySub: get('categorySub'),
    address: get('address'),
    regionName: get('regionName'),
    storePhone: get('storePhone'),
    timestamp: String(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(16).toString('base64url'),
  }
  let signature = sign(fields, getPartnerSecret('cashnote')!)
  if (get('tamper') === '1') signature = signature.replace(/^./, (c) => (c === '0' ? '1' : '0'))

  const inputs = [...SIGNED_FIELDS.map((k) => [k, fields[k] ?? ''] as const), ['signature', signature] as const]
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('\n')

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>이동 중</title></head>
<body><form id="f" method="post" action="/bridge/entry" accept-charset="UTF-8">${inputs}<noscript><button>계속</button></noscript></form>
<script>document.getElementById('f').submit()</script></body></html>`
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}
