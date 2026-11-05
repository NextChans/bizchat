import 'server-only'
import { randomBytes } from 'node:crypto'
import { audit, auditWarn } from '../audit'
import { BizchatError, getBizchatClient } from '../bizchat/client'
import type { BridgeSession } from '../bridge/session-crypto'
import { getFirstPayConfig } from '../firstpay/config'
import { FirstPayNoResponseError, approve, assertApprovalUrl, cancel, inquireResult } from '../firstpay/client'
import { payHash } from '../firstpay/hash'
import { AUTH_USER_CANCEL, REPLY_OK, failureMessage, isSuccess, orderTimestamp, replyCodeOf } from '../firstpay/types'
import { adDraftRepo } from '../ad/draft-repository'
import { orderRepo } from './repository'
import type { Order, OrderStatus } from './types'

const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** mxIssueNo: BZ + YYYYMMDDHHMMSS + 랜덤 10자 = 26자 (최대 32). 재사용하면 9713 */
function newOrderId(issuedAt: string): string {
  const rnd = [...randomBytes(10)].map((b) => ID_ALPHABET[b % 36]).join('')
  return `BZ${issuedAt}${rnd}`
}

export const ORDER_ID_RE = /^BZ\d{14}[0-9A-Z]{10}$/

function log(order: Pick<Order, 'id'>, type: string, detail: Record<string, string | number | boolean | null | undefined> = {}) {
  void orderRepo.appendEvent({ orderId: order.id, at: Date.now(), type, detail })
  audit(`order.${type}`, { orderId: order.id, ...detail })
}

// ───────────────────────── 1. 결제 준비 ─────────────────────────

export type GoPayParams = {
  sdkUrl: string
  env: 'develop' | 'product'
  params: {
    mxId: string
    mxIssueNo: string
    mxIssueDate: string
    orderName: string
    amount: number
    returnUrl: string
    callHash: string
    lang: 'ko'
    appScheme?: string
  }
}

/**
 * 견적을 서버에서 다시 받아 금액을 정하고 주문을 저장한 뒤 goPay 파라미터를 돌려준다.
 * callHash 는 여기서만 만든다. 브라우저는 받은 값을 SDK 에 넘기기만 한다.
 */
export async function preparePayment(session: BridgeSession, targetCount: number): Promise<GoPayParams> {
  if (!session.draft) throw new Error('no draft')
  const draft = await adDraftRepo.get(session.draft.draftId)
  if (!draft || draft.sid !== session.sid) throw new Error('draft not found')

  const bizchat = getBizchatClient()
  const options = await bizchat.targetOptions(draft.merchant.regionName)
  if (!options.includes(targetCount)) throw new BizchatError('invalid target count', false)

  const quote = await bizchat.quote({ draftId: draft.id, regionName: draft.merchant.regionName, messageType: draft.message.type, targetCount })
  if (!Number.isSafeInteger(quote.totalAmount) || quote.totalAmount < 100) throw new Error('invalid quote amount')

  const cfg = getFirstPayConfig()
  const issuedAt = orderTimestamp()
  const id = newOrderId(issuedAt)
  const orderName = `비즈챗 광고문자 ${targetCount.toLocaleString('ko-KR')}건`
  const now = Date.now()

  await orderRepo.create({
    id,
    issuedAt,
    sid: session.sid,
    partnerMerchantId: session.merchant.partnerMerchantId,
    draftId: draft.id,
    quoteId: quote.quoteId,
    targetCount,
    orderName,
    amount: quote.totalAmount,
    status: 'READY',
    createdAt: now,
    updatedAt: now,
  })
  log({ id }, 'prepared', { sid: session.sid, draftId: draft.id, amount: quote.totalAmount, targetCount })

  return {
    sdkUrl: cfg.sdkUrl,
    env: cfg.env,
    params: {
      mxId: cfg.mxId,
      mxIssueNo: id,
      mxIssueDate: issuedAt,
      orderName,
      amount: quote.totalAmount,
      // 결제서버의 POST 에는 세션 쿠키가 실리지 않으므로 주문번호를 경로에 담는다
      returnUrl: `${cfg.appBaseUrl}/bridge/pay/return/${id}`,
      callHash: payHash(cfg.mxId, id, quote.totalAmount, cfg.passKey),
      lang: 'ko',
      ...(cfg.appScheme ? { appScheme: cfg.appScheme } : {}),
    },
  }
}

// ───────────────────────── 2. 인증 결과 → 승인 ─────────────────────────

export type AuthResultForm = Record<string, string>

/**
 * returnUrl 처리. 어떤 경우에도 던지지 않고 최종 주문 상태를 돌려준다(화면은 상태로 그린다).
 * 새로고침·재전송으로 다시 들어와도 READY 가 아니면 아무것도 하지 않는다(멱등).
 */
export async function handleAuthResult(orderId: string, form: AuthResultForm): Promise<Order | null> {
  const order = await orderRepo.get(orderId)
  if (!order) return null
  if (order.status !== 'READY') {
    log(order, 'auth_result_ignored', { status: order.status, code: form.code })
    return order
  }

  const code = form.code ?? ''
  log(order, 'auth_result', { code, hasFdTid: Boolean(form.fdTid) })

  if (code === AUTH_USER_CANCEL) {
    return (await orderRepo.transition(order.id, ['READY'], 'USER_CANCELED', { replyCode: code })) ?? order
  }
  if (code !== REPLY_OK) {
    return (
      (await orderRepo.transition(order.id, ['READY'], 'AUTH_FAILED', {
        replyCode: code,
        replyMessage: (form.message ?? '').slice(0, 200),
      })) ?? order
    )
  }

  const cfg = getFirstPayConfig()
  // 경로의 주문번호·가맹점·금액이 인증 결과와 같아야 한다. 결제창 파라미터는 브라우저를 거친다
  const mismatch =
    form.mxIssueNo !== order.id ? 'mxIssueNo' :
    form.mxId !== cfg.mxId ? 'mxId' :
    Number(form.amount) !== order.amount ? 'amount' : null
  if (mismatch) {
    auditWarn('order.auth_mismatch', { orderId: order.id, field: mismatch, expected: mismatch === 'amount' ? order.amount : null, actual: mismatch === 'amount' ? form.amount : null })
    return (await orderRepo.transition(order.id, ['READY'], 'AUTH_FAILED', { replyMessage: `${mismatch} mismatch` })) ?? order
  }

  let approvalUrl: URL
  try {
    approvalUrl = assertApprovalUrl(form.approvalUrl ?? '')
  } catch (e) {
    auditWarn('order.approval_url_rejected', { orderId: order.id, host: safeHost(form.approvalUrl) })
    return (await orderRepo.transition(order.id, ['READY'], 'AUTH_FAILED', { replyMessage: (e as Error).message })) ?? order
  }
  const fdTid = form.fdTid ?? ''
  if (!fdTid || fdTid.length > 40) {
    return (await orderRepo.transition(order.id, ['READY'], 'AUTH_FAILED', { replyMessage: 'missing fdTid' })) ?? order
  }

  // 원자적 선점. 동시 콜백·다른 탭의 같은 초안 결제가 있으면 여기서 끊는다(승인 안 함 → 과금 없음)
  const claimed = await orderRepo.claimForApproval(order.id, { fdTid })
  if (!claimed) {
    const now = await orderRepo.get(order.id)
    log(order, 'claim_lost', { status: now?.status })
    return now
  }

  let res
  try {
    res = await approve({ approvalUrl, mxIssueNo: claimed.id, fdTid })
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown'
    // 요청 후 무응답은 결제가 성립했을 수 있다 → 보류. 요청 전 오류(설정 등)도 안전하게 보류로 두고 조회로 확정
    auditWarn('order.approve_no_response', { orderId: claimed.id, noResponse: e instanceof FirstPayNoResponseError, reason })
    return (await orderRepo.transition(claimed.id, ['APPROVING'], 'APPROVAL_UNKNOWN', { replyMessage: reason })) ?? claimed
  }

  log(claimed, 'approve_response', { code: res.code, replyCode: res.data?.replyCode })
  if (!isSuccess(res)) {
    return (
      (await orderRepo.transition(claimed.id, ['APPROVING'], 'APPROVAL_FAILED', {
        replyCode: replyCodeOf(res),
        replyMessage: failureMessage(res).slice(0, 200),
      })) ?? claimed
    )
  }

  const d = res.data!
  const payment = { tid: String(d.tid ?? ''), payMethod: String(d.payMethod ?? ''), authNo: d.authNo ? String(d.authNo) : undefined, replyCode: REPLY_OK }

  // 승인 응답에 금액이 오면 한 번 더 대조. 다르면 발송하지 않고 취소한다
  if (d.amount !== undefined && d.amount !== null && d.amount !== '' && Number(d.amount) !== claimed.amount) {
    auditWarn('order.approved_amount_mismatch', { orderId: claimed.id, expected: claimed.amount, actual: String(d.amount) })
    const mm = await orderRepo.transition(claimed.id, ['APPROVING'], 'AMOUNT_MISMATCH', payment)
    return mm ? refund(mm, '승인 금액 불일치', true) : claimed
  }
  // 가상계좌는 입금 통보가 있어야 결제 완료다. 이 흐름은 즉시결제만 다룬다(MID 결제수단에서 VA 제외 필요)
  if (d.vactNo) {
    auditWarn('order.virtual_account_unsupported', { orderId: claimed.id })
  }

  const paid = await orderRepo.transition(claimed.id, ['APPROVING'], 'PAID', payment)
  if (!paid) return orderRepo.get(claimed.id)
  log(paid, 'paid', { amount: paid.amount, payMethod: paid.payMethod })
  return dispatchSend(paid)
}

function safeHost(raw: string | undefined): string {
  try {
    return new URL(raw ?? '').host.slice(0, 80)
  } catch {
    return 'invalid'
  }
}

// ───────────────────────── 3. 결제 완료 → 비즈챗 발송 요청 ─────────────────────────

export async function dispatchSend(order: Order): Promise<Order | null> {
  const sending = await orderRepo.transition(order.id, ['PAID', 'SEND_UNKNOWN'], 'SENDING')
  if (!sending) return orderRepo.get(order.id)

  try {
    const draft = await adDraftRepo.get(sending.draftId)
    // 초안이 없으면 보낼 문안이 없다 → 확정 실패로 보고 환불
    if (!draft) throw new BizchatError('draft not found', false)
    const m = draft.merchant
    const r = await getBizchatClient().requestSend({
      idempotencyKey: sending.id,
      quoteId: sending.quoteId,
      draftId: draft.id,
      merchant: {
        partnerCode: m.partnerCode,
        partnerMerchantId: m.partnerMerchantId,
        storeName: m.storeName,
        storePhone: m.storePhone,
        regionName: m.regionName,
        address: m.address,
      },
      targeting: { regionName: m.regionName, targetCount: sending.targetCount },
      message: draft.message,
      payment: { orderId: sending.id, amount: sending.amount, tid: sending.tid!, payMethod: sending.payMethod!, paidAt: sending.updatedAt },
    })
    const done = await orderRepo.transition(sending.id, ['SENDING'], 'SEND_REQUESTED', { sendRequestId: r.sendRequestId })
    log(sending, 'send_requested', { sendRequestId: r.sendRequestId })
    return done
  } catch (e) {
    const definitive = e instanceof BizchatError && !e.retryable
    auditWarn('order.send_failed', { orderId: sending.id, definitive, error: e instanceof Error ? e.message : 'unknown' })
    if (!definitive) {
      // 접수됐을 수 있다. 환불하면 "돈은 돌려받고 문자는 나가는" 사고가 난다 → 같은 멱등키로 재시도
      return orderRepo.transition(sending.id, ['SENDING'], 'SEND_UNKNOWN')
    }
    const refunding = await orderRepo.transition(sending.id, ['SENDING'], 'REFUNDING')
    return refunding ? refund(refunding, '비즈챗 발송 접수 실패', true) : orderRepo.get(sending.id)
  }
}

// ───────────────────────── 4. 보상: 결제 취소 ─────────────────────────

async function refund(order: Order, reason: string, netCancel: boolean): Promise<Order | null> {
  const from: OrderStatus[] = ['REFUNDING', 'AMOUNT_MISMATCH']
  if (!order.tid || !order.payMethod) {
    auditWarn('order.refund_missing_tid', { orderId: order.id })
    return orderRepo.transition(order.id, from, 'REFUND_FAILED', { replyMessage: 'tid/payMethod missing' })
  }
  try {
    const res = await cancel({
      payMethod: order.payMethod,
      mxIssueNo: order.id,
      mxIssueDate: order.issuedAt, // 원거래 값
      amount: order.amount,
      tid: order.tid,
      reason,
      netCancel,
    })
    if (isSuccess(res)) {
      log(order, 'refunded', { reason })
      return orderRepo.transition(order.id, from, 'REFUNDED', { replyMessage: reason })
    }
    auditWarn('order.refund_failed', { orderId: order.id, replyCode: replyCodeOf(res), message: failureMessage(res) })
    return orderRepo.transition(order.id, from, 'REFUND_FAILED', { replyCode: replyCodeOf(res), replyMessage: failureMessage(res).slice(0, 200) })
  } catch (e) {
    // 취소 무응답: 취소됐을 수 있음. 운영자가 조회 후 처리(REFUND_FAILED 는 알림 대상)
    auditWarn('order.refund_no_response', { orderId: order.id, error: e instanceof Error ? e.message : 'unknown' })
    return orderRepo.transition(order.id, from, 'REFUND_FAILED', { replyMessage: 'cancel no response' })
  }
}

// ───────────────────────── 5. 보류 건 확정 ─────────────────────────

const UNKNOWN_SETTLE_MS = 2 * 60_000

/**
 * APPROVAL_UNKNOWN: 거래 조회로 승인 여부를 확정한다.
 * SEND_UNKNOWN: 같은 멱등키로 비즈챗 발송을 재요청한다.
 * 운영에서는 같은 함수를 배치(크론)로도 돌린다.
 */
export async function reconcile(orderId: string): Promise<Order | null> {
  const order = await orderRepo.get(orderId)
  if (!order) return null
  if (order.status === 'SEND_UNKNOWN') return dispatchSend(order)
  if (order.status !== 'APPROVAL_UNKNOWN') return order

  let res
  try {
    res = await inquireResult({ mxIssueNo: order.id, mxIssueDate: order.issuedAt })
  } catch {
    return order
  }
  // 조회 API 성공 code 는 문서 예시가 "0000" 과 "200" 으로 엇갈린다 → 둘 다 통신 성공으로 보고 data 로만 판정
  const commOk = ['200', '0000'].includes(String(res.code)) && res.data
  if (!commOk) {
    log(order, 'inquiry_failed', { code: res.code })
    return order
  }
  const txs = res.data!.transactions ?? []
  const approvals = txs.filter((t) => t.PayStatus === 'APPROVAL' && t.ReplyCode === REPLY_OK)
  const cancels = txs.filter((t) => t.PayStatus !== 'APPROVAL' && t.ReplyCode === REPLY_OK)
  log(order, 'inquiry', { count: txs.length, approvals: approvals.length, cancels: cancels.length })

  if (approvals.length === 1 && cancels.length === 0 && Number(approvals[0]!.Amount) === order.amount && approvals[0]!.TID) {
    const a = approvals[0]!
    const paid = await orderRepo.transition(order.id, ['APPROVAL_UNKNOWN'], 'PAID', {
      tid: a.TID,
      payMethod: a.PayMethod,
      authNo: a.AuthNO,
      replyCode: REPLY_OK,
    })
    return paid ? dispatchSend(paid) : orderRepo.get(order.id)
  }
  const settled = Date.now() - (order.approvingAt ?? order.updatedAt) > UNKNOWN_SETTLE_MS
  if (approvals.length === 0 && settled) {
    return orderRepo.transition(order.id, ['APPROVAL_UNKNOWN'], 'APPROVAL_FAILED', { replyMessage: 'not approved (inquiry)' })
  }
  // 그 밖(부분 취소, 금액 상이, 다건)은 자동 확정하지 않는다 → 운영 확인
  return order
}
