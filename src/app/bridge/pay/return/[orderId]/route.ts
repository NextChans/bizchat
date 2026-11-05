import { NextResponse } from 'next/server'
import { auditWarn } from '@/lib/audit'
import { ORDER_ID_RE, handleAuthResult } from '@/lib/order/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 16 * 1024

const seeResult = (orderId: string) =>
  new NextResponse(null, { status: 303, headers: { Location: `/bridge/pay/result/${orderId}`, 'Cache-Control': 'no-store' } })

/**
 * 결제창 returnUrl. 결제서버가 form POST(인증 결과)한다. 세션 쿠키는 실리지 않는다(cross-site POST).
 * 받은 자리에서 바로 승인 → 비즈챗 발송 요청까지 처리하고 결과 화면으로 303 (fdTid·approvalUrl 을 브라우저로 되돌리지 않음).
 */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (!ORDER_ID_RE.test(orderId)) return new NextResponse('Not Found', { status: 404 })

  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return seeResult(orderId)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    auditWarn('order.return_unparsable', { orderId })
    return seeResult(orderId)
  }
  // 모르는 필드는 무시(파라미터는 예고 없이 추가될 수 있음)
  const fields: Record<string, string> = {}
  for (const k of ['mxId', 'mxIssueNo', 'mxIssueDate', 'amount', 'code', 'message', 'fdTid', 'approvalUrl']) {
    const v = form.get(k)
    if (typeof v === 'string') fields[k] = v.slice(0, 2048)
  }

  try {
    await handleAuthResult(orderId, fields)
  } catch (e) {
    // 여기서 500 을 내면 사용자는 결제창 위에서 빈 화면을 본다. 상태는 주문에 남아 있다
    auditWarn('order.return_error', { orderId, error: e instanceof Error ? e.message : 'unknown' })
  }
  return seeResult(orderId)
}

export async function GET(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (!ORDER_ID_RE.test(orderId)) return new NextResponse('Not Found', { status: 404 })
  return seeResult(orderId)
}
