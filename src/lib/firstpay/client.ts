import 'server-only'
import { APPROVAL_HOSTS, getFirstPayConfig } from './config'
import { approveHash, cancelHash, inquiryHash } from './hash'
import type { ApiResponse } from './types'

/**
 * 요청은 나갔지만 판정할 응답을 못 받은 상태. 결제가 성립했을 수 있으므로 실패로 확정하지 않는다.
 * (요청 전 단계 오류는 일반 Error)
 */
export class FirstPayNoResponseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirstPayNoResponseError'
  }
}

async function postJson<T = ApiResponse>(url: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    })
  } catch (e) {
    throw new FirstPayNoResponseError(e instanceof Error ? e.name : 'fetch_failed')
  }
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new FirstPayNoResponseError(`unparsable response (HTTP ${res.status})`)
  }
}

export function assertApprovalUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('approvalUrl is not a URL')
  }
  if (url.protocol !== 'https:' || !APPROVAL_HOSTS.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error(`approvalUrl host not allowed: ${url.host}`)
  }
  return url
}

/** 승인. fdTid 는 인증 결과로 받은 값 그대로 */
export function approve(p: { approvalUrl: URL; mxIssueNo: string; fdTid: string }): Promise<ApiResponse> {
  const { mxId, passKey } = getFirstPayConfig()
  return postJson(p.approvalUrl.toString(), {
    mxId,
    mxIssueNo: p.mxIssueNo,
    fdTid: p.fdTid,
    callHash: approveHash(mxId, p.mxIssueNo, passKey),
  }, 30_000)
}

/**
 * 전체 취소. mxIssueDate 는 원거래 값(아니면 P502).
 * netCancel: 승인 정상 응답 후 내부 처리(비즈챗 발송 접수) 실패로 되돌릴 때
 */
export function cancel(p: {
  payMethod: string
  mxIssueNo: string
  mxIssueDate: string
  amount: number
  tid: string
  reason: string
  netCancel: boolean
}): Promise<ApiResponse> {
  const { mxId, passKey, baseUrl } = getFirstPayConfig()
  return postJson(`${baseUrl}/cancel`, {
    payMethod: p.payMethod,
    mxId,
    mxIssueNo: p.mxIssueNo,
    mxIssueDate: p.mxIssueDate,
    amount: p.amount,
    tid: p.tid,
    cancelNotice: p.reason.slice(0, 100),
    ...(p.netCancel ? { netCancelFlag: 'Y' } : {}),
    callHash: cancelHash(mxId, p.mxIssueNo, p.amount, passKey),
  }, 30_000)
}

export type InquiryTx = {
  PayMethod?: string
  PayStatus?: string
  Amount?: number | string
  ReplyCode?: string
  TID?: string
  AuthNO?: string
  AuthDate?: string
}

/** 단건 결제 결과 데이터 조회(inquiry-data). 승인 무응답 건 확정용 */
export function inquireResult(p: { mxIssueNo: string; mxIssueDate: string }) {
  const { mxId, passKey, baseUrl } = getFirstPayConfig()
  return postJson<ApiResponse<{ transactionCount?: number; transactions?: InquiryTx[] } & Record<string, unknown>>>(
    `${baseUrl}/api/v1/inquiry/inquiry-data`,
    {
      mxId,
      mxIssueNo: p.mxIssueNo,
      mxIssueDate: p.mxIssueDate,
      replyStatus: 'ALL',
      callHash: inquiryHash(mxId, p.mxIssueNo, p.mxIssueDate, passKey),
    },
    15_000,
  )
}
