export type ApiResponse<T = ResultData> = {
  /** 통신 결과. 성공은 "200" */
  code?: string
  message?: string
  status?: string
  requestId?: string
  data?: T | null
}

export type ResultData = {
  replyCode?: string
  replyMessage?: string
  payMethod?: string
  tid?: string
  oTid?: string
  amount?: string | number
  authNo?: string
  authDate?: string
  issName?: string
  ccNo?: string
  vactNo?: string
  [k: string]: unknown
}

export const REPLY_OK = '0000'
/** 결제창 인증 결과: 사용자가 결제창을 닫음(정상 흐름) */
export const AUTH_USER_CANCEL = '9000'

/** 승인·취소 성공 = 통신 성공(code 200) 그리고 거래 성공(replyCode 0000) */
export function isSuccess(res: ApiResponse | null | undefined): boolean {
  return String(res?.code) === '200' && res?.data?.replyCode === REPLY_OK
}

export function failureMessage(res: ApiResponse | null | undefined): string {
  if (!res) return '응답 없음'
  if (String(res.code) !== '200') return res.message || `통신 실패 (${res.code ?? '-'})`
  return res.data?.replyMessage || `거래 실패 (${res.data?.replyCode ?? '-'})`
}

export function replyCodeOf(res: ApiResponse | null | undefined): string {
  return res?.data?.replyCode ?? String(res?.code ?? '')
}

/** YYYYMMDDHHMMSS (KST) */
export function orderTimestamp(date = new Date()): string {
  return new Date(date.getTime() + 9 * 3600_000).toISOString().replace(/\D/g, '').slice(0, 14)
}
