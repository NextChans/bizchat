import { createHash } from 'node:crypto'

/** SHA-256 소문자 hex. 입력 순서는 배포 샘플 기준(kpn_pg_manual reference/kpn/v3/SOURCES.md) */
export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** 결제창 호출: mxId + mxIssueNo + amount + passKey */
export const payHash = (mxId: string, mxIssueNo: string, amount: number, passKey: string) =>
  sha256(`${mxId}${mxIssueNo}${amount}${passKey}`)

/** 승인: mxId + mxIssueNo + passKey — amount 없음 */
export const approveHash = (mxId: string, mxIssueNo: string, passKey: string) => sha256(`${mxId}${mxIssueNo}${passKey}`)

/** 취소: mxId + mxIssueNo + amount + passKey */
export const cancelHash = (mxId: string, mxIssueNo: string, amount: number, passKey: string) =>
  sha256(`${mxId}${mxIssueNo}${amount}${passKey}`)

/** 거래 조회: mxId + mxIssueNo + mxIssueDate + passKey */
export const inquiryHash = (mxId: string, mxIssueNo: string, mxIssueDate: string, passKey: string) =>
  sha256(`${mxId}${mxIssueNo}${mxIssueDate}${passKey}`)

/**
 * 가상계좌 입금통보 검증(MxHASH256): MxID + passKey + MxIssueNO + MxIssueDate + Amount + Currency
 * 순서가 다른 해시들과 다르다(passKey 가 두 번째). 값은 통보 값이 아니라 가맹점이 저장한 주문 값으로 만든다.
 */
export const vactNotiHash = (mxId: string, passKey: string, mxIssueNo: string, mxIssueDate: string, amount: number, currency: string) =>
  sha256(`${mxId}${passKey}${mxIssueNo}${mxIssueDate}${amount}${currency}`)
