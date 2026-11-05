import { smsBytes } from '../text'
import { SLOT_DEFS, type SlotKey } from './slots'
import { AD_FOOTER, LINK_BLOCK, type AdTemplate, type Segment } from './templates'

export type SlotValues = Partial<Record<SlotKey, string>>

/** 통신사/비즈챗 규격 미확정 — 목업 상한 */
export const LMS_MAX_BYTES = 2000
export const TITLE_MAX_BYTES = 40

/** 링크·고정 문구까지 합친 본문 세그먼트 */
export function composeBody(tpl: AdTemplate, includeLink: boolean): Segment[] {
  return [...tpl.body, ...(includeLink ? LINK_BLOCK : []), AD_FOOTER]
}

export function slotsOf(tpl: AdTemplate, includeLink: boolean): SlotKey[] {
  const keys = new Set<SlotKey>()
  for (const seg of [...tpl.title, ...composeBody(tpl, includeLink)]) if (typeof seg !== 'string') keys.add(seg.slot)
  return [...keys]
}

/** 날짜 슬롯은 YYYY-MM-DD 로 저장, 문자에는 "2026년 11월 30일" 로 */
export function displayValue(slot: SlotKey, value: string): string {
  if (SLOT_DEFS[slot].kind === 'date') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일`
  }
  return value
}

function join(segs: Segment[], values: SlotValues): string {
  return segs.map((seg) => (typeof seg === 'string' ? seg : displayValue(seg.slot, values[seg.slot] ?? ''))).join('')
}

export type RenderedMessage = { title: string; body: string; titleBytes: number; bodyBytes: number }

export function renderMessage(tpl: AdTemplate, values: SlotValues, includeLink: boolean): RenderedMessage {
  const title = join(tpl.title, values)
  const body = join(composeBody(tpl, includeLink), values)
  return { title, body, titleBytes: smsBytes(title), bodyBytes: smsBytes(body) }
}
