import 'server-only'

type Fields = Record<string, string | number | boolean | null | undefined>

/**
 * 구조화 감사 로그. 수집기(Loki 등)가 JSON 한 줄로 파싱한다.
 * 개인사업자는 가게 전화번호가 개인 휴대폰인 경우가 많아 원문을 남기지 않는다.
 */
export function audit(event: string, fields: Fields = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...fields }))
}

export function auditWarn(event: string, fields: Fields = {}): void {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', event, ...fields }))
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length < 8) return '***'
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`
}
