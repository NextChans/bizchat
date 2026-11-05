import 'server-only'
import { cookies } from 'next/headers'
import { getSessionSecret } from '../env'
import { SESSION_MAX_SEC, SESSION_TTL_SEC, seal, unseal, type BridgeSession } from './session-crypto'

export const SESSION_COOKIE = 'bizchat_bridge'

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // 파트너 앱에서 넘어오는 cross-site POST → 303 → GET(top-level) 에서도 쿠키가 실려야 하므로 Lax
  sameSite: 'lax' as const,
  path: '/bridge',
  maxAge: SESSION_TTL_SEC,
}

export function sealSession(session: BridgeSession): string {
  return seal(session, getSessionSecret())
}

export async function readSession(): Promise<BridgeSession | null> {
  const store = await cookies()
  return unseal(store.get(SESSION_COOKIE)?.value, getSessionSecret())
}

/** Server Action / Route Handler 에서만 호출 가능 */
export async function writeSession(session: BridgeSession): Promise<void> {
  const store = await cookies()
  const now = Math.floor(Date.now() / 1000)
  // 결제창(최대 30분)을 오가는 동안 끊기지 않게 활동 시 연장. 진입 후 2시간이 상한
  const exp = Math.min(session.iat + SESSION_MAX_SEC, now + SESSION_TTL_SEC)
  store.set(SESSION_COOKIE, sealSession({ ...session, exp }), { ...sessionCookieOptions, maxAge: Math.max(0, exp - now) })
}
