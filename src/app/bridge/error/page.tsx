import Notice from '../Notice'

const MESSAGES: Record<string, { title: string; body: string }> = {
  expired: { title: '연결 시간이 지났어요', body: '캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요.' },
  replay: { title: '이미 열린 요청이에요', body: '캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요.' },
}
const DEFAULT = { title: '페이지를 열 수 없어요', body: '캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요.' }

export default async function ErrorPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams
  const m = MESSAGES[code] ?? DEFAULT
  return (
    <Notice title={m.title} body={m.body}>
      {/^[a-z_]{1,32}$/.test(code) && <p className="muted small">오류 코드: {code}</p>}
    </Notice>
  )
}
