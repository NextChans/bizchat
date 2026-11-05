'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startPayment } from './actions'
import type { GoPayParams } from '@/lib/order/service'

export type QuoteView = { targetCount: number; unitPrice: number; supplyAmount: number; vat: number; totalAmount: number }

type Props = { storeName: string; regionName: string; templateLabel: string; messageType: 'SMS' | 'LMS'; quotes: QuoteView[] }

type FirstPayCtor = new (opts: {
  env: 'develop' | 'product'
  openType: 'popup' | 'layer' | 'submit'
  closeWindowOnly: boolean
  onFailure: (e: { code?: string; message?: string }) => void
}) => { goPay: (p: GoPayParams['params']) => void }

declare global {
  interface Window {
    FirstPay?: FirstPayCtor
  }
}

const SDK_HOSTS = new Set(['dev.firstpay.co.kr', 'pay.firstpay.co.kr'])
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

function loadSdk(src: string): Promise<FirstPayCtor> {
  const url = new URL(src)
  if (url.protocol !== 'https:' || !SDK_HOSTS.has(url.hostname)) return Promise.reject(new Error('sdk host'))
  if (window.FirstPay) return Promise.resolve(window.FirstPay)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = url.toString()
    s.async = true
    s.onload = () => (window.FirstPay ? resolve(window.FirstPay) : reject(new Error('sdk missing')))
    s.onerror = () => reject(new Error('sdk load failed'))
    document.head.appendChild(s)
  })
}

export default function SendForm({ storeName, regionName, templateLabel, messageType, quotes }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState(quotes[1]?.targetCount ?? quotes[0]?.targetCount ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const q = quotes.find((x) => x.targetCount === selected)

  const pay = () =>
    startTransition(async () => {
      setError(null)
      const r = await startPayment(selected)
      if (!r.ok) {
        if (r.redirectTo) router.replace(r.redirectTo)
        setError(r.error)
        return
      }
      try {
        const FirstPay = await loadSdk(r.pay.sdkUrl)
        // 파트너 앱 웹뷰에서는 팝업이 막히는 경우가 많아 페이지 이동(submit) 방식으로 연다
        new FirstPay({
          env: r.pay.env,
          openType: 'submit',
          closeWindowOnly: false,
          onFailure: (e) => setError(`결제창을 열지 못했어요. (${e.code ?? 'SDK'})`),
        }).goPay(r.pay.params)
      } catch {
        setError('결제창을 불러오지 못했어요. 네트워크를 확인해 주세요.')
      }
    })

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="icon-btn" aria-label="문구 수정" onClick={() => router.push('/bridge')}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="topbar-title">발송 요청</h1>
      </header>
      <main className="content">
        <h2 className="h2">몇 명에게 보낼까요?</h2>
        <p className="muted small">
          {regionName ? `${regionName} 주변 ` : ''}혜택/광고 수신에 동의한 SKT 고객에게 보내요. · {storeName} · {templateLabel} · {messageType}
        </p>

        <div className="targets" role="radiogroup" aria-label="발송 대상 규모">
          {quotes.map((x) => (
            <button
              key={x.targetCount}
              type="button"
              role="radio"
              aria-checked={x.targetCount === selected}
              className={`target ${x.targetCount === selected ? 'active' : ''}`}
              onClick={() => setSelected(x.targetCount)}
            >
              <span className="target-count">{x.targetCount.toLocaleString('ko-KR')}명</span>
              <span className="target-price">{won(x.totalAmount)}</span>
            </button>
          ))}
        </div>

        {q && (
          <dl className="bill">
            <dt>건당 단가</dt>
            <dd>{won(q.unitPrice)} × {q.targetCount.toLocaleString('ko-KR')}건</dd>
            <dt>공급가액</dt>
            <dd>{won(q.supplyAmount)}</dd>
            <dt>부가세</dt>
            <dd>{won(q.vat)}</dd>
            <dt className="total">결제 금액</dt>
            <dd className="total">{won(q.totalAmount)}</dd>
          </dl>
        )}
        <p className="muted small">결제가 끝나면 바로 발송을 요청해요. 발송 접수에 실패하면 결제는 자동으로 취소돼요.</p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="bottom-bar single">
          <button type="button" className="btn primary" disabled={pending || !q} onClick={pay}>
            {pending ? '결제창 여는 중…' : q ? `${won(q.totalAmount)} 결제하기` : '대상을 선택해 주세요'}
          </button>
        </div>
      </main>
    </div>
  )
}
