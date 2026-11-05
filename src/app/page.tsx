import Link from 'next/link'
import { isDevToolsEnabled } from '@/lib/env'

export const dynamic = 'force-dynamic'

export default function Home() {
  return (
    <main className="shell plain">
      <h1 className="h1">비즈챗 브릿지</h1>
      <p className="muted">
        파트너 앱 배너에서 <code>POST /bridge/entry</code> 로 진입하는 페이지입니다. 직접 열 수 있는 화면이 없습니다.
      </p>
      {isDevToolsEnabled() && (
        <p>
          <Link className="btn primary inline" href="/dev/partner">
            목업 파트너(캐시노트) 배너로 진입해 보기
          </Link>
        </p>
      )}
    </main>
  )
}
