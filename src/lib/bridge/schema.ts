import { z } from 'zod'
import { cleanLine, deriveRegionName, normalizePhone } from '../text'
import { PARTNER_CODES } from './partners'
import { classifyIndustry } from './industry'
import type { Merchant } from './merchant'

const required = (max: number) =>
  z.string().transform(cleanLine).pipe(z.string().min(1).max(max))

const optional = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? cleanLine(v) : ''))
    .pipe(z.string().max(max))

const phone = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return ''
    const p = normalizePhone(v)
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'invalid phone' })
      return z.NEVER
    }
    return p
  })

/** 파트너 POST 본문(목업 규격). 서명 검증은 이 파싱 "전" 원문 값으로 한다. */
export const entrySchema = z.object({
  partnerCode: z.enum(PARTNER_CODES),
  partnerMerchantId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  storeName: required(50),
  categoryMain: required(40),
  categorySub: optional(40),
  address: optional(200),
  regionName: optional(20),
  storePhone: phone,
  timestamp: z.string().regex(/^\d{10}$/),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
})

export type EntryInput = z.infer<typeof entrySchema>

export function toMerchant(input: EntryInput): Merchant {
  return {
    partnerCode: input.partnerCode,
    partnerMerchantId: input.partnerMerchantId,
    storeName: input.storeName,
    categoryMain: input.categoryMain,
    categorySub: input.categorySub,
    address: input.address,
    regionName: input.regionName || deriveRegionName(input.address),
    storePhone: input.storePhone,
    industry: classifyIndustry(input.categoryMain, input.categorySub),
  }
}
