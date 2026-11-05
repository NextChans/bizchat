import { notFound } from 'next/navigation'
import { isDevToolsEnabled } from '@/lib/env'
import { FIELD_LABELS, PRESETS } from './presets'

export const dynamic = 'force-dynamic'

/**
 * [개발 전용] 캐시노트 앱의 비즈챗 배너를 흉내 낸다.
 * 실제로는 파트너 서버가 서명한 form 을 웹뷰에서 auto-submit 한다. 여기서는 /dev/partner/submit 이 그 역할을 한다.
 */
export default async function DevPartnerPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  if (!isDevToolsEnabled()) notFound()
  const { preset: presetId } = await searchParams
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]

  return (
    <main className="shell plain">
      <h1 className="h1">[목업] 캐시노트 앱</h1>
      <p className="muted small">개발 환경 전용. 운영 배포에서는 404 입니다.</p>
      <div className="devform row">
        {PRESETS.map((p) => (
          <a key={p.id} className={`tpl-tab ${p.id === preset.id ? 'active' : ''}`} href={`/dev/partner?preset=${p.id}`}>
            {p.label}
          </a>
        ))}
      </div>
      <form className="devform" method="post" action="/dev/partner/submit" key={preset.id}>
        {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]).map((k) => (
          <label className="field" key={k}>
            <span className="field-label">{FIELD_LABELS[k]}</span>
            <input name={k} defaultValue={preset.fields[k]} />
          </label>
        ))}
        <label className="check">
          <input type="checkbox" name="tamper" value="1" />
          <span className="check-ico" aria-hidden />
          서명 변조해서 보내기(거부되는지 확인)
        </label>
        <button type="submit" className="banner">
          문자 광고, 비즈챗으로 쉽게 보내세요
          <small>캐시노트 회원 전용 · 지금 광고 만들기 →</small>
        </button>
      </form>
    </main>
  )
}
