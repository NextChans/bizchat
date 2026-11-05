import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import type { BridgeSession } from '../bridge/session-crypto'

const MX = 'testcorp'
const KEY = 'test-pass-key'
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

process.env.KPN_MX_ID = MX
process.env.KPN_PASSKEY = KEY
process.env.APP_BASE_URL = 'https://bizchat.example.com'

const { preparePayment, handleAuthResult, reconcile } = await import('./service')
const { orderRepo } = await import('./repository')
const { adDraftRepo } = await import('../ad/draft-repository')

async function session(): Promise<BridgeSession> {
  const s: BridgeSession = {
    v: 1,
    sid: randomUUID(),
    iat: 0,
    exp: 9e9,
    merchant: {
      partnerCode: 'cashnote', partnerMerchantId: 'CN_1', storeName: '가게', categoryMain: '음식점업', categorySub: '',
      address: '', regionName: '역삼동', storePhone: '', industry: 'food',
    },
  }
  const d = await adDraftRepo.create({
    sid: s.sid, merchant: s.merchant, templateId: 'intro', templateLabel: '가게 소개', includeLink: false, values: {},
    message: { type: 'LMS', title: '(광고) 가게', body: '(광고)[SKT] 본문', bodyBytes: 600 },
  })
  return { ...s, draft: { draftId: d.id, templateLabel: d.templateLabel, at: 0 } }
}

type Call = { url: string; body: Record<string, unknown> }
let calls: Call[] = []
let approveReply: () => unknown
let cancelReply: () => unknown
let inquiryReply: () => unknown

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 })
const OK_APPROVE = (amount?: number) => ({ code: '200', data: { replyCode: '0000', tid: 'TID-1', payMethod: 'CC', authNo: '123', ...(amount ? { amount } : {}) } })

beforeEach(() => {
  calls = []
  delete process.env.BIZCHAT_MOCK_SEND
  approveReply = () => OK_APPROVE()
  cancelReply = () => ({ code: '200', data: { replyCode: '0000' } })
  inquiryReply = () => ({ code: '200', data: { transactionCount: 0, transactions: [] } })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    calls.push({ url: String(url), body })
    const reply = String(url).endsWith('/cancel') ? cancelReply : String(url).includes('/inquiry/') ? inquiryReply : approveReply
    const r = reply()
    if (r instanceof Error) throw r
    return json(r)
  }))
})
afterEach(() => vi.unstubAllGlobals())

async function prepared(given?: BridgeSession) {
  const s = given ?? (await session())
  const pay = await preparePayment(s, 1000)
  const p = pay.params
  const authForm = {
    mxId: p.mxId, mxIssueNo: p.mxIssueNo, mxIssueDate: p.mxIssueDate, amount: String(p.amount),
    code: '0000', fdTid: 'FDTID-1', approvalUrl: 'https://dev.firstpay.co.kr/approval/xyz',
  }
  return { s, pay, p, authForm }
}

describe('결제 준비', () => {
  it('금액은 서버 견적, 해시는 mxId+mxIssueNo+amount+passKey, returnUrl 에 주문번호', async () => {
    const { p } = await prepared()
    expect(p.amount).toBe(1000 * 33 + 3300)
    expect(p.callHash).toBe(sha(`${MX}${p.mxIssueNo}${p.amount}${KEY}`))
    expect(p.returnUrl).toBe(`https://bizchat.example.com/bridge/pay/return/${p.mxIssueNo}`)
    expect(p.mxIssueNo.length).toBeLessThanOrEqual(32)
    expect(JSON.stringify(p)).not.toContain(KEY)
  })
  it('목록에 없는 대상 규모 거부', async () => {
    await expect(preparePayment(await session(), 777)).rejects.toThrow()
  })
})

describe('인증 결과 → 승인 → 발송', () => {
  it('발송 요청에 서버 보관 문안·대상·결제정보를 담는다', async () => {
    const send = vi.fn()
    const { getBizchatClient } = await import('../bizchat/client')
    const c = getBizchatClient()
    const orig = c.requestSend.bind(c)
    c.requestSend = async (req) => (send(req), orig(req))
    const { p, authForm } = await prepared()
    await handleAuthResult(p.mxIssueNo, authForm)
    c.requestSend = orig
    const req = send.mock.calls[0]![0]
    expect(req).toMatchObject({
      idempotencyKey: p.mxIssueNo,
      targeting: { regionName: '역삼동', targetCount: 1000 },
      message: { type: 'LMS', body: '(광고)[SKT] 본문' },
      payment: { orderId: p.mxIssueNo, amount: p.amount, tid: 'TID-1', payMethod: 'CC' },
    })
  })
  it('정상: 승인 해시에 amount 없음, 발송 요청까지 완료', async () => {
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, authForm)
    expect(o?.status).toBe('SEND_REQUESTED')
    expect(calls).toHaveLength(1)
    expect(calls[0]!.body).toEqual({ mxId: MX, mxIssueNo: p.mxIssueNo, fdTid: 'FDTID-1', callHash: sha(`${MX}${p.mxIssueNo}${KEY}`) })
  })
  it('같은 콜백이 다시 와도 승인 1회(멱등)', async () => {
    const { p, authForm } = await prepared()
    await handleAuthResult(p.mxIssueNo, authForm)
    const again = await handleAuthResult(p.mxIssueNo, authForm)
    expect(again?.status).toBe('SEND_REQUESTED')
    expect(calls).toHaveLength(1)
  })
  it('동시 콜백 2건이어도 승인 1회', async () => {
    const { p, authForm } = await prepared()
    await Promise.all([handleAuthResult(p.mxIssueNo, authForm), handleAuthResult(p.mxIssueNo, authForm)])
    expect(calls.filter((c) => !c.url.endsWith('/cancel'))).toHaveLength(1)
  })
  it('금액 변조 → 승인하지 않음', async () => {
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, { ...authForm, amount: '100' })
    expect(o?.status).toBe('AUTH_FAILED')
    expect(calls).toHaveLength(0)
  })
  it('approvalUrl 호스트 위조(SSRF) → 호출하지 않음', async () => {
    const { p, authForm } = await prepared()
    for (const evil of ['https://evil.example.com/a', 'http://dev.firstpay.co.kr/a', 'https://dev.firstpay.co.kr.evil.com/a', 'https://x@dev.firstpay.co.kr/a']) {
      const { p: p2, authForm: f2 } = await prepared()
      const o = await handleAuthResult(p2.mxIssueNo, { ...f2, approvalUrl: evil })
      expect(o?.status).toBe('AUTH_FAILED')
    }
    expect(calls).toHaveLength(0)
    void p, authForm
  })
  it('9000 사용자 취소는 정상 흐름', async () => {
    const { p, authForm } = await prepared()
    expect((await handleAuthResult(p.mxIssueNo, { ...authForm, code: '9000' }))?.status).toBe('USER_CANCELED')
  })
  it('code 200 이어도 replyCode 실패면 실패', async () => {
    approveReply = () => ({ code: '200', data: { replyCode: '8373', replyMessage: '한도초과' } })
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, authForm)
    expect(o?.status).toBe('APPROVAL_FAILED')
    expect(o?.replyCode).toBe('8373')
  })
  it('승인 무응답은 실패로 확정하지 않고 보류 → 조회로 승인 확인되면 발송', async () => {
    approveReply = () => new DOMException('timeout', 'TimeoutError')
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, authForm)
    expect(o?.status).toBe('APPROVAL_UNKNOWN')

    inquiryReply = () => ({
      code: '0000',
      data: { transactionCount: 1, transactions: [{ PayStatus: 'APPROVAL', ReplyCode: '0000', Amount: p.amount, TID: 'TID-9', PayMethod: 'CC' }] },
    })
    const r = await reconcile(p.mxIssueNo)
    expect(r?.status).toBe('SEND_REQUESTED')
    expect(r?.tid).toBe('TID-9')
    const inq = calls.find((c) => c.url.includes('/inquiry/'))!
    expect(inq.body.callHash).toBe(sha(`${MX}${p.mxIssueNo}${p.mxIssueDate}${KEY}`))
  })
  it('승인 무응답 직후 조회에 거래가 없으면 아직 확정하지 않음', async () => {
    approveReply = () => new DOMException('timeout', 'TimeoutError')
    const { p, authForm } = await prepared()
    await handleAuthResult(p.mxIssueNo, authForm)
    expect((await reconcile(p.mxIssueNo))?.status).toBe('APPROVAL_UNKNOWN')
  })
  it('승인 응답 금액이 다르면 발송하지 않고 망취소', async () => {
    approveReply = () => OK_APPROVE(1)
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, authForm)
    expect(o?.status).toBe('REFUNDED')
  })
})

describe('발송 실패 보상', () => {
  it('접수 거절(확정) → 원거래 mxIssueDate 로 망취소', async () => {
    process.env.BIZCHAT_MOCK_SEND = 'reject'
    const { p, authForm } = await prepared()
    const o = await handleAuthResult(p.mxIssueNo, authForm)
    expect(o?.status).toBe('REFUNDED')
    const c = calls.find((x) => x.url === 'https://dev.firstpay.co.kr/cancel')!
    expect(c.body).toMatchObject({
      payMethod: 'CC', mxId: MX, mxIssueNo: p.mxIssueNo, mxIssueDate: p.mxIssueDate, amount: p.amount, tid: 'TID-1', netCancelFlag: 'Y',
      callHash: sha(`${MX}${p.mxIssueNo}${p.amount}${KEY}`),
    })
  })
  it('접수 무응답 → 취소하지 않고 보류, 재확인 시 같은 멱등키로 재요청', async () => {
    process.env.BIZCHAT_MOCK_SEND = 'timeout'
    const { p, authForm } = await prepared()
    expect((await handleAuthResult(p.mxIssueNo, authForm))?.status).toBe('SEND_UNKNOWN')
    expect(calls.some((c) => c.url.endsWith('/cancel'))).toBe(false)
    delete process.env.BIZCHAT_MOCK_SEND
    expect((await reconcile(p.mxIssueNo))?.status).toBe('SEND_REQUESTED')
  })
  it('취소 실패 → REFUND_FAILED(수동 처리 대상)', async () => {
    process.env.BIZCHAT_MOCK_SEND = 'reject'
    cancelReply = () => ({ code: '200', data: { replyCode: 'P502', replyMessage: '원거래 없음' } })
    const { p, authForm } = await prepared()
    expect((await handleAuthResult(p.mxIssueNo, authForm))?.status).toBe('REFUND_FAILED')
  })
})

describe('중복 결제 방지', () => {
  it('같은 초안의 다른 주문이 결제됐으면 두 번째는 승인하지 않음', async () => {
    const s = await session()
    const a = await prepared(s)
    const b = await prepared(s)
    await handleAuthResult(a.p.mxIssueNo, a.authForm)
    const o = await handleAuthResult(b.p.mxIssueNo, b.authForm)
    expect(o?.status).toBe('DUPLICATE_BLOCKED')
    expect(calls).toHaveLength(1)
    expect((await orderRepo.findChargedByDraft(s.draft!.draftId))?.id).toBe(a.p.mxIssueNo)
  })
})
