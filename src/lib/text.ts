/** 제어문자·제로폭·양방향 제어문자 제거 (문자 스푸핑/레이아웃 깨짐 방지) */
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤﻿]/g

/** 한 줄 입력: NFC 정규화, 위험 문자 제거, 공백 축약 */
export function cleanLine(s: string): string {
  return s.normalize('NFC').replace(UNSAFE, '').replace(/\s+/g, ' ').trim()
}

/** 여러 줄 입력: 줄 단위로 정리하고 3줄 이상 연속 빈 줄은 1줄로 */
export function cleanMultiline(s: string): string {
  return s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(UNSAFE, '').replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 숫자만 남긴 국내 전화번호 → 하이픈 포맷. 형식이 아니면 null */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, '')
  if (!/^0\d{8,10}$/.test(d) && !/^1[5-9]\d{6}$/.test(d)) return null
  if (/^1[5-9]\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}` // 대표번호 1588-0000
  if (d.startsWith('02')) {
    return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`
  }
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

/**
 * 주소에서 동네명 추출. 도로명 주소의 괄호 참고항목 "(역삼동)" → 지번 주소의 동/읍/면 → 구/군 순.
 */
export function deriveRegionName(address: string): string {
  const paren = address.match(/\(([가-힣0-9]+(?:동|읍|면|가))(?:[,\s][^)]*)?\)/)
  if (paren?.[1]) return paren[1]
  const tokens = address.split(/\s+/)
  const dong = [...tokens].reverse().find((t) => /^[가-힣]+[0-9]*(?:동|읍|면|가)$/.test(t))
  if (dong) return dong
  const gu = tokens.find((t) => /^[가-힣]+(?:구|군)$/.test(t))
  return gu ?? ''
}

/** LMS 바이트 수(통신사 과금 기준 EUC-KR 근사: ASCII 1, 그 외 2) */
export function smsBytes(s: string): number {
  let n = 0
  for (const ch of s) n += ch.codePointAt(0)! <= 0x7f ? 1 : 2
  return n
}
