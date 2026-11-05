export const dynamic = 'force-dynamic'

/** 컨테이너 헬스체크·CI 스모크 테스트용. 설정값·비밀값은 내보내지 않는다 */
export function GET() {
  return Response.json({ ok: true, service: 'bizchat-bridge', version: process.env.APP_VERSION ?? 'dev' }, { headers: { 'Cache-Control': 'no-store' } })
}
