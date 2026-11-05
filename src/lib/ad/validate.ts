import { cleanLine, cleanMultiline, normalizePhone } from '../text'
import { SLOT_DEFS, type SlotKey } from './slots'
import type { SlotValues } from './render'

export type SlotResult = { ok: true; value: string } | { ok: false; error: string }

/** 오늘 날짜(KST, YYYY-MM-DD). 서버(UTC)와 브라우저가 같은 기준을 쓰도록 고정 */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 클라이언트(즉시 피드백)와 서버(최종 판정)가 같은 함수를 쓴다. 서버 판정만 신뢰한다. */
export function validateSlot(slot: SlotKey, raw: unknown, now: Date = new Date()): SlotResult {
  const def = SLOT_DEFS[slot]
  if (typeof raw !== 'string') return { ok: false, error: `${def.label}을(를) 입력해 주세요.` }
  const value = def.kind === 'multiline' ? cleanMultiline(raw) : cleanLine(raw)
  if (!value) return { ok: false, error: `${def.label}을(를) 입력해 주세요.` }
  if ([...value].length > def.maxLength) return { ok: false, error: `${def.maxLength}자 이내로 입력해 주세요.` }

  switch (def.kind) {
    case 'tel': {
      const p = normalizePhone(value)
      return p ? { ok: true, value: p } : { ok: false, error: '전화번호 형식을 확인해 주세요.' }
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        return { ok: false, error: '날짜를 선택해 주세요.' }
      }
      if (slot === 'eventEndDate' && value < todayKst(now)) {
        return { ok: false, error: '종료 날짜는 오늘 이후여야 해요.' }
      }
      return { ok: true, value }
    }
    case 'url': {
      let url: URL
      try {
        url = new URL(value)
      } catch {
        return { ok: false, error: 'https:// 로 시작하는 주소를 입력해 주세요.' }
      }
      if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) {
        return { ok: false, error: 'https:// 로 시작하는 주소를 입력해 주세요.' }
      }
      return { ok: true, value: url.toString() }
    }
    default:
      return { ok: true, value }
  }
}

export type ValuesResult =
  | { ok: true; values: SlotValues }
  | { ok: false; errors: Partial<Record<SlotKey, string>> }

/** 템플릿에 쓰인 슬롯만 받아들이고(나머지는 버림) 전부 필수로 검증 */
export function validateValues(slots: SlotKey[], raw: Record<string, unknown>, now: Date = new Date()): ValuesResult {
  const values: SlotValues = {}
  const errors: Partial<Record<SlotKey, string>> = {}
  for (const slot of slots) {
    const r = validateSlot(slot, raw[slot], now)
    if (r.ok) values[slot] = r.value
    else errors[slot] = r.error
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values }
}
