import Link from 'next/link'
import { notFound } from 'next/navigation'
import { isDevToolsEnabled } from '@/lib/env'
import { PRESETS } from '../dev/partner/presets'

export const dynamic = 'force-dynamic'

/**
 * [개발·로컬 전용] 체험 진입점. 운영 배포에서는 404.
 * 실제 서비스에는 직접 여는 화면이 없고 파트너 앱 배너(POST /bridge/entry)로만 들어온다.
 */
export default function SamplePage() {
  if (!isDevToolsEnabled()) notFound()
  const kpnEnv = process.env.KPN_ENV?.trim() === 'product' ? 'product' : 'develop'

  return (
    <main className="shell plain">
      <h1 className="h1">비즈챗 브릿지 체험</h1>
      <p className="muted small">개발·로컬 전용 화면입니다. 운영 배포에서는 열리지 않습니다.</p>

      <dl className="kv">
        <dt>결제서버</dt>
        <dd>{kpnEnv === 'develop' ? '테스트(dev.firstpay)' : '운영'}</dd>
        <dt>비즈챗</dt>
        <dd>목업</dd>
        <dt>버전</dt>
        <dd>{process.env.APP_VERSION ?? 'dev'}</dd>
      </dl>

      <h2 className="h2">1. 가게를 골라 배너로 들어가기</h2>
      <p className="muted small">캐시노트 앱 배너를 누른 것처럼, 서명한 가게 정보를 들고 브릿지로 들어갑니다.</p>
      <div className="devform">
        {PRESETS.map((p) => (
          <Link key={p.id} className="btn inline" href={`/dev/partner?preset=${p.id}`}>
            {p.label}
          </Link>
        ))}
      </div>

      <h2 className="h2">2. 결제 시험</h2>
      <ul className="muted small">
        <li>카드·간편결제: 테스트 결제창에서 바로 승인되고, 비즈챗 목업에 발송 요청까지 갑니다.</li>
        <li>가상계좌: 계좌 발급 후 &quot;입금 대기&quot; 화면에서 <b>[개발] 입금통보 보내기</b>로 입금을 흉내 냅니다(로컬은 결제서버 통보를 받을 수 없음).</li>
        <li>발송 실패 시험: 컨테이너 환경변수 <code>BIZCHAT_MOCK_SEND=reject</code> 또는 <code>timeout</code>.</li>
      </ul>

      <h2 className="h2">3. 상태 확인</h2>
      <p className="muted small">
        <a href="/api/health">/api/health</a>
      </p>
    </main>
  )
}
