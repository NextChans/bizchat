import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import type { Merchant } from './merchant'

export const SESSION_TTL_SEC = 30 * 60
/** 슬라이딩 연장 상한(진입 시점 기준) */
export const SESSION_MAX_SEC = 2 * 60 * 60

/** 이 세션에서 완성한 광고 초안(본문은 서버 저장소에. 쿠키에는 참조만) */
export type DraftRef = { draftId: string; templateLabel: string; at: number }

export type BridgeSession = {
  v: 1
  /** 브릿지 세션 ID. 비즈챗 전달의 멱등키로도 쓴다 */
  sid: string
  merchant: Merchant
  iat: number
  exp: number
  draft?: DraftRef
}

const AAD = Buffer.from('bizchat-bridge-session-v1')

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'bizchat-bridge', 'session-v1', 32))
}

const b64 = (b: Buffer) => b.toString('base64url')

/** AES-256-GCM. 쿠키 값만으로 위·변조와 열람을 모두 막는다(서버 저장소 불필요). */
export function seal(session: BridgeSession, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv)
  cipher.setAAD(AAD)
  const ct = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()])
  return ['v1', b64(iv), b64(ct), b64(cipher.getAuthTag())].join('.')
}

export function unseal(token: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): BridgeSession | null {
  if (!token) return null
  const [ver, iv, ct, tag] = token.split('.')
  if (ver !== 'v1' || !iv || !ct || !tag) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(iv, 'base64url'))
    decipher.setAAD(AAD)
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const json = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
    const s = JSON.parse(json) as BridgeSession
    if (s.v !== 1 || typeof s.exp !== 'number' || s.exp <= nowSec) return null
    return s
  } catch {
    return null
  }
}
