import 'server-only'

/**
 * FirstPay(KPN) v3 설정. 규격: kpn_pg_manual `apps/web/content/docs/llm-quick-reference.mdx`
 * passKey 는 이 모듈 밖(클라이언트 번들·로그)으로 내보내지 않는다.
 */
export type FirstPayEnv = 'develop' | 'product'

export const BASE_URLS: Record<FirstPayEnv, string> = {
  develop: 'https://dev.firstpay.co.kr',
  product: 'https://pay.firstpay.co.kr',
}

/** approvalUrl 은 브라우저를 거친 값이라 이 호스트만 호출한다(SSRF) */
export const APPROVAL_HOSTS: ReadonlySet<string> = new Set(Object.values(BASE_URLS).map((u) => new URL(u).hostname))

export type FirstPayConfig = {
  env: FirstPayEnv
  baseUrl: string
  sdkUrl: string
  mxId: string
  passKey: string
  appBaseUrl: string
  appScheme?: string
}

/** 대시보드 붙여넣기로 섞이는 공백·따옴표 제거. 한 글자만 섞여도 9010 으로만 드러난다 */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^["']|["']$/g, '').trim()
  return t ? t : undefined
}

export function getFirstPayConfig(): FirstPayConfig {
  // 오타·빈 값은 테스트로 떨어진다. 운영은 명시적으로 product 일 때만
  const env: FirstPayEnv = clean(process.env.KPN_ENV) === 'product' ? 'product' : 'develop'
  const mxId = clean(process.env.KPN_MX_ID)
  const passKey = clean(process.env.KPN_PASSKEY)
  const appBaseUrl = clean(process.env.APP_BASE_URL)
  if (!mxId || !passKey) throw new Error('KPN_MX_ID / KPN_PASSKEY is not configured')
  if (!appBaseUrl) throw new Error('APP_BASE_URL is not configured')
  if (process.env.NODE_ENV === 'production' && env === 'develop' && process.env.VERCEL_ENV === 'production') {
    throw new Error('KPN_ENV=develop on production deployment')
  }
  const appScheme = clean(process.env.PARTNER_APP_SCHEME)
  return {
    env,
    baseUrl: BASE_URLS[env],
    sdkUrl: `${BASE_URLS[env]}/js/firstpay_v2.js`,
    mxId,
    passKey,
    appBaseUrl: appBaseUrl.replace(/\/$/, ''),
    // 앱 웹뷰에서 간편결제 후 앱 복귀용. scheme:// 형식만 허용(웹 스킴 불가)
    appScheme: appScheme && /^[a-z][a-z0-9+.-]*:\/\/$/i.test(appScheme) && !/^https?:/i.test(appScheme) ? appScheme : undefined,
  }
}
