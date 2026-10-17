import { findOversizedAttachment } from './attachmentLimits'

it('accepts the exact byte limit and rejects the first byte beyond it', () => {
  const exact = new File([new Uint8Array(1024 * 1024)], 'exact.bin')
  const over = new File([new Uint8Array(1024 * 1024 + 1)], 'over.bin')
  expect(findOversizedAttachment([exact], 1)).toBeUndefined()
  expect(findOversizedAttachment([exact, over], 1)).toBe(over)
})

it.each([0, -1, NaN, Infinity])('rejects invalid limits rather than silently using a default (%p)', (limit) => {
  expect(() => findOversizedAttachment([], limit)).toThrow(RangeError)
})
