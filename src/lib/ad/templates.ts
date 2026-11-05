import type { IndustryKey } from '../bridge/industry'
import type { SlotKey } from './slots'

export type SlotRef = { slot: SlotKey; label?: string }
export type Segment = string | SlotRef

export type AdTemplate = {
  id: string
  label: string
  title: Segment[]
  body: Segment[]
}

export type TemplateSet = { recommendedId: string; templates: AdTemplate[] }

/** 링크 사용 체크 시 본문 끝(고정 문구 앞)에 붙는다 */
export const LINK_BLOCK: Segment[] = ['\n\n▶ 자세히 보기: ', { slot: 'linkUrl' }]

/** 광고성 정보 전송 고정 문구(정보통신망법 제50조). 사용자 편집 불가 */
export const AD_FOOTER =
  '\n\n※ 이 메시지는 SK텔레콤에서 혜택/광고 수신에 동의하신 고객님께 보내 드렸습니다.\n\n감사합니다.\n\n무료 수신거부 1504'

const s = (slot: SlotKey, label?: string): SlotRef => (label ? { slot, label } : { slot })

/** 템플릿 작성용 태그 함수: t`(광고) ${s('storeName')} 특별 혜택` */
function t(strings: TemplateStringsArray, ...refs: Segment[]): Segment[] {
  const out: Segment[] = []
  strings.forEach((str, i) => {
    if (str) out.push(str)
    const ref = refs[i]
    if (ref) out.push(ref)
  })
  // 인접한 문자열 조각은 합친다(고정 문구 삽입 시)
  return out.reduce<Segment[]>((acc, seg) => {
    const last = acc[acc.length - 1]
    if (typeof seg === 'string' && typeof last === 'string') acc[acc.length - 1] = last + seg
    else acc.push(seg)
    return acc
  }, [])
}

const contact = t`■ 문의: ${s('storeName')}(${s('storePhone')})`

const eventTemplate = (headline: string): AdTemplate => ({
  id: 'event',
  label: '혜택(이벤트) 안내',
  title: t`(광고) ${s('storeName')} ${headline}`,
  body: [
    ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} ${headline} 안내

고객님, 안녕하세요.
문자를 받으신 고객님께만 드리는 특별한 혜택을 안내해 드립니다.
지금 바로 방문하셔서 준비된 깜짝 혜택을 받아보세요!

■ 특별 혜택 참여 안내
- 참여 방법: ${s('participation')}
- 제공 혜택: ${s('benefit')}
- 기간: ${s('eventEndDate')}까지

* 위 이벤트는 기재된 기간 동안만 진행됩니다.
* 방문 시 직원에게 이 문자를 보여주시면 혜택을 받으실 수 있습니다.

`,
    ...contact,
  ],
})

const FOOD: TemplateSet = {
  recommendedId: 'intro',
  templates: [
    {
      id: 'intro',
      label: '가게 소개',
      title: t`(광고) ${s('storeName')} 소개`,
      body: [
        ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} 소개

고객님, 안녕하세요.
${s('regionName')}에 자리한 ${s('storeName')}입니다.

${s('storeIntro')}

■ 대표 메뉴: ${s('mainItems', '대표 메뉴')}
■ 영업 시간: ${s('businessHours')}
■ 위치: ${s('address')}

`,
        ...contact,
      ],
    },
    {
      id: 'new-item',
      label: '신메뉴 출시 안내',
      title: t`(광고) ${s('storeName')} 신메뉴 출시`,
      body: [
        ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} 신메뉴 출시 안내

고객님, 안녕하세요.
${s('storeName')}에서 새로운 메뉴를 선보입니다.

■ 신메뉴: ${s('newItemName')}
${s('newItemDesc')}

■ 출시일: ${s('launchDate')}

`,
        ...contact,
      ],
    },
    eventTemplate('특별 혜택'),
  ],
}

const CONSTRUCTION: TemplateSet = {
  recommendedId: 'intro',
  templates: [
    {
      id: 'intro',
      label: '업체 소개',
      title: t`(광고) ${s('storeName')} 시공 안내`,
      body: [
        ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} 시공 안내

고객님, 안녕하세요.
${s('regionName')} 지역 시공 전문 ${s('storeName')}입니다.

${s('storeIntro', '업체 소개')}

■ 주요 시공 분야: ${s('mainItems', '주요 시공 분야')}
■ 시공 가능 지역: ${s('serviceArea', '시공 가능 지역')}
■ 상담 가능 시간: ${s('businessHours', '상담 가능 시간')}

현장 방문 상담과 견적은 무료로 도와드립니다.

`,
        ...contact,
      ],
    },
    {
      id: 'new-item',
      label: '신규 서비스 안내',
      title: t`(광고) ${s('storeName')} 신규 서비스`,
      body: [
        ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} 신규 서비스 안내

고객님, 안녕하세요.
${s('storeName')}에서 새로운 시공 서비스를 시작합니다.

■ 서비스: ${s('newItemName', '서비스명')}
${s('newItemDesc', '서비스 소개')}

■ 시작일: ${s('launchDate', '시작 날짜')}

`,
        ...contact,
      ],
    },
    {
      ...eventTemplate('견적 상담 혜택'),
      label: '견적·상담 혜택 안내',
    },
  ],
}

const MANUFACTURING: TemplateSet = {
  recommendedId: 'intro',
  templates: [
    {
      id: 'intro',
      label: '회사 소개',
      title: t`(광고) ${s('storeName')} 회사 소개`,
      body: [
        ...t`(광고)[SKT] ${s('regionName')} ${s('storeName')} 회사 소개

고객님, 안녕하세요.
${s('storeName')}입니다.

${s('storeIntro', '회사 소개')}

■ 주요 생산 품목: ${s('mainItems', '주요 생산 품목')}
■ 설비·역량: ${s('capability')}
■ 납품 가능 지역: ${s('serviceArea', '납품 가능 지역')}

소량 주문과 샘플 제작 문의도 환영합니다.

`,
        ...contact,
      ],
    },
    {
      id: 'new-item',
      label: '신제품 출시 안내',
      title: t`(광고) ${s('storeName')} 신제품 출시`,
      body: [
        ...t`(광고)[SKT] ${s('storeName')} 신제품 출시 안내

고객님, 안녕하세요.
${s('storeName')}에서 신제품을 출시했습니다.

■ 제품명: ${s('newItemName', '제품명')}
${s('newItemDesc', '제품 소개')}

■ 출시일: ${s('launchDate')}

`,
        ...contact,
      ],
    },
    {
      ...eventTemplate('납품 견적 혜택'),
      label: '견적·납품 혜택 안내',
    },
  ],
}

const GENERAL: TemplateSet = {
  recommendedId: 'intro',
  templates: [
    {
      ...FOOD.templates[0]!,
      body: FOOD.templates[0]!.body.map((seg) =>
        typeof seg !== 'string' && seg.slot === 'mainItems' ? { slot: 'mainItems', label: '대표 상품·서비스' } : seg,
      ),
    },
    { ...FOOD.templates[1]!, label: '신상품 출시 안내' },
    FOOD.templates[2]!,
  ],
}

const BY_INDUSTRY: Record<IndustryKey, TemplateSet> = {
  food: FOOD,
  construction: CONSTRUCTION,
  manufacturing: MANUFACTURING,
  general: GENERAL,
}

export function getTemplateSet(industry: IndustryKey): TemplateSet {
  return BY_INDUSTRY[industry]
}
