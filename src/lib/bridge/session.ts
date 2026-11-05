import 'server-only'
import { cookies } from 'next/headers'
import { getSessionSecret } from '../env'
import { SESSION_TTL_SEC, seal, unseal, type BridgeSession } from './session-crypto'

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
  const remaining = Math.max(0, session.exp - Math.floor(Date.now() / 1000))
  store.set(SESSION_COOKIE, sealSession(session), { ...sessionCookieOptions, maxAge: remaining })
}
