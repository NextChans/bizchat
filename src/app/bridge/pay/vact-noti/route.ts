import { auditWarn } from '@/lib/audit'
import { VACT_ACK_FAIL, VACT_ACK_OK } from '@/lib/firstpay/types'
import { handleVactNoti } from '@/lib/order/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BODY = 16 * 1024
const FIELDS = ['MxID', 'PayMethod', 'Currency', 'MxIssueNO', 'MxIssueDate', 'Amount', 'ReplyCode', 'MxHASH256', 'VactNo', 'TID', 'AuthDate'] as const

const ack = (ok: boolean) =>
  new Response(ok ? VACT_ACK_OK : VACT_ACK_FAIL, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/**
 * 가상계좌 입금통보(vactNotiUrl). 결제서버가 form POST(application/x-www-form-urlencoded)로 보낸다.
 * 응답 본문이 정확히 ACK=200OKOK 가 아니면 실패로 보고 다시 보낸다.
 * 위변조 판단은 MxHASH256 로 한다. 발신 IP(테스트 222.110.146.137 / 운영 210.182.8.137) 제한은 WAF·보안그룹에서 건다.
 * 송금인(Remitter)·현금영수증 번호 등 개인정보 필드는 읽지 않고 로그에도 남기지 않는다.
 */
export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? '0') > MAX_BODY) return ack(false)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    auditWarn('order.vact_noti_unparsable')
    return ack(false)
  }
  const fields: Record<string, string> = {}
  for (const k of FIELDS) {
    const v = form.get(k)
    if (typeof v === 'string') fields[k] = v.trim().slice(0, 128)
  }
  try {
    return ack(await handleVactNoti(fields))
  } catch (e) {
    auditWarn('order.vact_noti_error', { orderId: fields.MxIssueNO?.slice(0, 32) ?? null, error: e instanceof Error ? e.message : 'unknown' })
    return ack(false)
  }
}
