import { describe, expect, it } from 'vitest'
import { getTemplateSet } from './templates'
import { renderMessage, slotsOf } from './render'
import { validateSlot, validateValues } from './validate'

const event = getTemplateSet('food').templates.find((t) => t.id === 'event')!

describe('render', () => {
  it('스크린샷의 혜택(이벤트) 안내와 같은 구조 + 고정 문구', () => {
    const m = renderMessage(event, {
      storeName: '역삼 손칼국수', regionName: '역삼동', storePhone: '02-1234-5678',
      participation: '방문 시 문자 제시', benefit: '만두 1판 무료', eventEndDate: '2026-11-30',
    }, false)
    expect(m.title).toBe('(광고) 역삼 손칼국수 특별 혜택')
    expect(m.body.startsWith('(광고)[SKT] 역삼동 역삼 손칼국수 특별 혜택 안내')).toBe(true)
    expect(m.body).toContain('- 기간: 2026년 11월 30일까지')
    expect(m.body).toContain('■ 문의: 역삼 손칼국수(02-1234-5678)')
    expect(m.body.endsWith('무료 수신거부 1504')).toBe(true)
    expect(m.bodyBytes).toBeLessThan(2000)
  })
  it('링크 체크 시에만 linkUrl 슬롯 요구', () => {
    expect(slotsOf(event, false)).not.toContain('linkUrl')
    expect(slotsOf(event, true)).toContain('linkUrl')
  })
  it('모든 업종 템플릿이 광고 표기로 시작하고 고정 문구로 끝남', () => {
    for (const k of ['food', 'construction', 'manufacturing', 'general'] as const) {
      for (const t of getTemplateSet(k).templates) {
        const m = renderMessage(t, {}, false)
        expect(m.title.startsWith('(광고)')).toBe(true)
        expect(m.body.startsWith('(광고)[SKT]')).toBe(true)
        expect(m.body.endsWith('무료 수신거부 1504')).toBe(true)
      }
    }
  })
})

describe('validate', () => {
  const now = new Date('2026-11-05T15:30:00Z') // KST 11-06 00:30
  it('https 만 허용', () => {
    expect(validateSlot('linkUrl', 'javascript:alert(1)').ok).toBe(false)
    expect(validateSlot('linkUrl', 'http://naver.me/x').ok).toBe(false)
    expect(validateSlot('linkUrl', 'https://naver.me/x').ok).toBe(true)
  })
  it('종료일은 KST 오늘 이후', () => {
    expect(validateSlot('eventEndDate', '2026-11-05', now).ok).toBe(false)
    expect(validateSlot('eventEndDate', '2026-11-06', now).ok).toBe(true)
  })
  it('템플릿 외 키는 버리고 빈 슬롯은 에러', () => {
    const r = validateValues(['storeName', 'benefit'], { storeName: '가게', evil: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(['benefit'])
  })
})
