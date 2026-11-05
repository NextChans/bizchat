import 'server-only'

const isProd = () => process.env.NODE_ENV === 'production'

/** 세션 쿠키(AES-256-GCM) 키 원천. 운영에서 누락되면 기동 후 첫 요청에서 바로 실패시킨다. */
export function getSessionSecret(): string {
  const v = process.env.BRIDGE_SESSION_SECRET
  if (v && v.length >= 32) return v
  if (!isProd()) return 'dev-only-bridge-session-secret-do-not-use-in-prod'
  throw new Error('BRIDGE_SESSION_SECRET is missing or shorter than 32 chars')
}

/** 파트너별 HMAC 공유키. 등록되지 않은 파트너는 undefined → 진입 거부 */
export function getPartnerSecret(partnerCode: string): string | undefined {
  switch (partnerCode) {
    case 'cashnote':
      return process.env.CASHNOTE_PARTNER_SECRET || (isProd() ? undefined : 'dev-only-cashnote-partner-secret')
    default:
      return undefined
  }
}

/** 운영에서는 서명 검증을 끌 수 없다. */
export function isSignatureEnforced(): boolean {
  if (isProd()) return true
  return process.env.BRIDGE_SIGNATURE_MODE !== 'off'
}

/**
 * /dev/partner 목업 파트너 페이지. 파트너 비밀키로 서명을 대신 만들어 주는 화면이라
 * 운영 배포에서 열리면 누구나 진입 요청을 위조할 수 있다. Production 배포에서는 절대 열지 않는다.
 */
export function isDevToolsEnabled(): boolean {
  if (process.env.VERCEL_ENV === 'production') return false
  if (!isProd()) return true
  // 로컬 컨테이너(docker compose) 체험용. 실결제 서버(KPN_ENV=product)와는 절대 같이 켜지지 않는다
  if (isLocalSandbox()) return process.env.KPN_ENV?.trim() !== 'product'
  return process.env.VERCEL_ENV === 'preview' && process.env.BRIDGE_DEV_TOOLS === 'true'
}

/** 로컬 컨테이너 실행(APP_ENV=local). 운영 빌드(NODE_ENV=production)를 그대로 쓰되 개발 도구만 연다 */
export function isLocalSandbox(): boolean {
  return process.env.APP_ENV === 'local'
}
