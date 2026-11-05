import { readSession } from '@/lib/bridge/session'
import Notice from '../Notice'

export const dynamic = 'force-dynamic'

export default async function DonePage() {
  const session = await readSession()
  if (!session?.handoff) {
    return <Notice title="입력 시간이 지났어요" body="캐시노트 앱에서 비즈챗 배너를 다시 눌러 주세요." />
  }
  const { handoff, merchant } = session
  return (
    <Notice title="비즈챗으로 전달했어요" body={`${merchant.storeName} · ${handoff.templateLabel}`}>
      <dl className="kv">
        <dt>접수 번호</dt>
        <dd>{handoff.draftId}</dd>
      </dl>
      <p className="muted small">
        [목업] 실제 연동에서는 이 단계에서 비즈챗 발송 화면(대상 고객·발송 일시 선택)으로 이어집니다.
      </p>
    </Notice>
  )
}
