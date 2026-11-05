import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readSession } from '@/lib/bridge/session'
import { orderRepo } from '@/lib/order/repository'
import { ORDER_ID_RE } from '@/lib/order/service'
import type { Order, OrderStatus } from '@/lib/order/types'
import Notice from '../../../Notice'
import { isDevToolsEnabled } from '@/lib/env'
import { recheck, simulateDeposit } from './actions'

export const dynamic = 'force-dynamic'

type View = { title: string; body: string; retry?: boolean; recheck?: boolean; receipt?: boolean; vact?: boolean }

const VIEWS: Record<OrderStatus, View> = {
  READY: { title: '결제가 끝나지 않았어요', body: '결제창에서 결제를 마치지 않았어요.', retry: true },
  USER_CANCELED: { title: '결제를 취소했어요', body: '다시 결제하면 발송을 요청할 수 있어요.', retry: true },
  AUTH_FAILED: { title: '결제하지 못했어요', body: '결제가 진행되지 않았어요. 다시 시도해 주세요.', retry: true },
  APPROVAL_FAILED: { title: '결제하지 못했어요', body: '카드사·결제사에서 승인되지 않았어요. 다른 결제수단으로 다시 시도해 주세요.', retry: true },
  DUPLICATE_BLOCKED: { title: '이미 결제한 광고예요', body: '같은 광고에 결제가 이미 진행돼 이번 결제는 승인하지 않았어요. 청구되지 않아요.' },
  APPROVING: { title: '결제를 확인하고 있어요', body: '잠시 후 다시 확인해 주세요.', recheck: true },
  APPROVAL_UNKNOWN: { title: '결제를 확인하고 있어요', body: '결제 결과를 받지 못해 확인 중이에요. 중복 결제되지 않으니 다시 결제하지 마세요.', recheck: true },
  WAITING_DEPOSIT: { title: '입금을 기다리고 있어요', body: '아래 계좌로 입금하면 결제가 끝나고 비즈챗에 발송을 요청해요. 금액이 다르면 입금되지 않아요.', recheck: true, receipt: true, vact: true },
  DEPOSIT_EXPIRED: { title: '입금 기한이 지났어요', body: '입금되지 않아 발송하지 않았어요. 청구되지 않아요. 다시 결제해 주세요.', retry: true },
  DEPOSIT_CANCELED: { title: '확인이 필요한 결제예요', body: '은행에서 입금이 취소됐어요. 담당자가 확인 후 연락드릴게요.' },
  PAID: { title: '발송 요청 중이에요', body: '결제는 완료됐어요. 비즈챗에 발송을 요청하고 있어요.', recheck: true, receipt: true },
  SENDING: { title: '발송 요청 중이에요', body: '결제는 완료됐어요. 비즈챗에 발송을 요청하고 있어요.', recheck: true, receipt: true },
  SEND_UNKNOWN: { title: '발송 접수를 확인하고 있어요', body: '결제는 완료됐어요. 발송 접수 결과를 확인 중이에요.', recheck: true, receipt: true },
  SEND_REQUESTED: { title: '발송 요청을 완료했어요', body: '비즈챗 검수 후 문자가 발송돼요.', receipt: true },
  REFUNDING: { title: '결제를 취소하고 있어요', body: '발송 접수에 실패해 결제를 취소하고 있어요.' },
  REFUNDED: { title: '결제를 취소했어요', body: '발송 접수에 실패해 결제를 자동으로 취소했어요. 카드사에 따라 환불 반영까지 며칠 걸릴 수 있어요.', retry: true },
  REFUND_FAILED: { title: '확인이 필요한 결제예요', body: '결제 취소를 마치지 못했어요. 담당자가 확인 후 연락드릴게요.' },
  AMOUNT_MISMATCH: { title: '확인이 필요한 결제예요', body: '결제 금액이 달라 발송하지 않았어요. 담당자가 확인 후 처리해 드릴게요.' },
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`
const PAY_METHOD: Record<string, string> = { CC: '카드', IC: '계좌이체', MO: '휴대폰', VA: '가상계좌', SP: '간편결제' }

export default async function ResultPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (!ORDER_ID_RE.test(orderId)) notFound()
  const [session, order] = await Promise.all([readSession(), orderRepo.get(orderId)])
  if (!order) notFound()

  const v = VIEWS[order.status]
  const owner = session?.sid === order.sid
  // 세션이 없으면(웹뷰 쿠키 유실 등) 상태 문구만. 금액·주문 정보는 본인 세션에만 보여 준다
  if (!owner) return <Notice title={v.title} body="자세한 내용은 캐시노트 앱에서 비즈챗 배너를 다시 눌러 확인해 주세요." />

  return (
    <Notice title={v.title} body={v.body}>
      {v.receipt && <Receipt order={order} vact={v.vact} />}
      {v.recheck && (
        <form action={recheck.bind(null, order.id)}>
          <button className="btn primary inline" type="submit">
            다시 확인하기
          </button>
        </form>
      )}
      {order.status === 'WAITING_DEPOSIT' && isDevToolsEnabled() && (
        <form action={simulateDeposit.bind(null, order.id)}>
          <button className="btn inline" type="submit">
            [개발] 입금통보 보내기
          </button>
        </form>
      )}
      {v.retry && (
        <Link className="btn primary inline" href="/bridge/send">
          다시 결제하기
        </Link>
      )}
      <p className="muted small">주문번호 {order.id}</p>
    </Notice>
  )
}

const kstDateTime = (s?: string) =>
  s && /^\d{14}$/.test(s) ? `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}` : null

function Receipt({ order, vact }: { order: Order; vact?: boolean }) {
  return (
    <dl className="kv">
      {vact && order.vactNo && (
        <>
          <dt>입금 계좌</dt>
          <dd>
            {order.bankName ? `${order.bankName} ` : ''}
            {order.vactNo}
          </dd>
        </>
      )}
      {vact && kstDateTime(order.vactExpireAt) && (
        <>
          <dt>입금 기한</dt>
          <dd>{kstDateTime(order.vactExpireAt)}</dd>
        </>
      )}
      <dt>발송 건수</dt>
      <dd>{order.targetCount.toLocaleString('ko-KR')}건</dd>
      <dt>결제 금액</dt>
      <dd>{won(order.amount)}</dd>
      {order.payMethod && (
        <>
          <dt>결제수단</dt>
          <dd>{PAY_METHOD[order.payMethod] ?? order.payMethod}</dd>
        </>
      )}
      {order.sendRequestId && (
        <>
          <dt>접수 번호</dt>
          <dd>{order.sendRequestId}</dd>
        </>
      )}
    </dl>
  )
}
