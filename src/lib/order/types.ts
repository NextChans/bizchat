/**
 * 발송 결제 주문 상태.
 *
 *   READY ─(인증 0000)→ APPROVING ─(승인 성공)→ PAID → SENDING ─→ SEND_REQUESTED (완료)
 *     │                    │                              │
 *     ├ USER_CANCELED(9000) ├ APPROVAL_FAILED              ├ SEND_UNKNOWN (비즈챗 무응답: 같은 멱등키로 재시도)
 *     ├ AUTH_FAILED         ├ APPROVAL_UNKNOWN (승인 무응답: 조회로 확정)
 *     └ DUPLICATE_BLOCKED   └ AMOUNT_MISMATCH (승인 금액 불일치: 취소 필요)
 *                                                          └ REFUNDING → REFUNDED / REFUND_FAILED(수동 처리)
 *
 * 가상계좌(VA): 승인 = 계좌 발급일 뿐 결제 완료가 아니다. 입금통보(vactNotiUrl)를 받아야 PAID 로 간다.
 *   APPROVING ─(승인 성공, vactNo)→ WAITING_DEPOSIT ─(입금통보 00003000)→ PAID → (위와 같음)
 *                                       └ DEPOSIT_EXPIRED (입금기한 경과. 기한 뒤 통보가 와도 PAID 로 받는다)
 *   PAID·SEND_* ─(입금취소 통보 00003100)→ DEPOSIT_CANCELED (발송 중단. 이미 접수됐으면 수동 처리)
 */
export type OrderStatus =
  | 'READY'
  | 'USER_CANCELED'
  | 'AUTH_FAILED'
  | 'DUPLICATE_BLOCKED'
  | 'APPROVING'
  | 'APPROVAL_FAILED'
  | 'APPROVAL_UNKNOWN'
  | 'AMOUNT_MISMATCH'
  | 'WAITING_DEPOSIT'
  | 'DEPOSIT_EXPIRED'
  | 'DEPOSIT_CANCELED'
  | 'PAID'
  | 'SENDING'
  | 'SEND_UNKNOWN'
  | 'SEND_REQUESTED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'REFUND_FAILED'

/** 결제가 성립했거나 성립했을 수 있는 상태. 같은 초안에 두 번째 결제를 막는 기준 */
export const CHARGED_OR_MAYBE: readonly OrderStatus[] = [
  'APPROVING',
  'APPROVAL_UNKNOWN',
  'AMOUNT_MISMATCH',
  'WAITING_DEPOSIT',
  'PAID',
  'SENDING',
  'SEND_UNKNOWN',
  'SEND_REQUESTED',
  'REFUNDING',
  'REFUND_FAILED',
]

export type Order = {
  /** = mxIssueNo */
  id: string
  /** = mxIssueDate. 취소·조회 시 이 값을 그대로 쓴다 */
  issuedAt: string
  sid: string
  partnerMerchantId: string
  draftId: string
  quoteId: string
  targetCount: number
  orderName: string
  /** 원. 비즈챗 견적 금액(서버 결정). 브라우저 값은 쓰지 않는다 */
  amount: number
  status: OrderStatus
  fdTid?: string
  tid?: string
  payMethod?: string
  authNo?: string
  replyCode?: string
  replyMessage?: string
  sendRequestId?: string
  /** 가상계좌: 발급 계좌·은행·입금기한(YYYYMMDDHHMMSS, KST)·입금 시각 */
  vactNo?: string
  bankName?: string
  vactExpireAt?: string
  depositedAt?: string
  createdAt: number
  updatedAt: number
  approvingAt?: number
}

export type OrderEvent = {
  orderId: string
  at: number
  type: string
  from?: OrderStatus
  to?: OrderStatus
  detail?: Record<string, string | number | boolean | null | undefined>
}
