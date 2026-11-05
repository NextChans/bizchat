import { describe, expect, it } from 'vitest'
import { classify } from './client'

describe('비즈챗 오류 분류(결제 취소 여부를 가른다)', () => {
  it.each([
    [400, false], [401, false], [409, false], [422, false],
    [408, true], [429, true], [500, true], [502, true], [503, true],
  ])('HTTP %i → retryable=%s', (status, retryable) => expect(classify(status).retryable).toBe(retryable))
})
