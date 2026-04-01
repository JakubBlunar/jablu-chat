jest.mock('@/lib/socket', () => ({ getSocket: jest.fn() }))
jest.mock('@/stores/message.store', () => ({
  useMessageStore: jest.fn(() => [])
}))
jest.mock('zustand/react/shallow', () => ({
  useShallow: (fn: any) => fn
}))

import { formatTyping } from './useTypingIndicators'

describe('formatTyping', () => {
  it('returns empty string for no names', () => {
    expect(formatTyping([])).toBe('')
  })

  it('returns singular for one name', () => {
    expect(formatTyping(['Alice'])).toBe('Alice is typing…')
  })

  it('returns "and" for two names', () => {
    expect(formatTyping(['Alice', 'Bob'])).toBe('Alice and Bob are typing…')
  })

  it('returns "Several people" for three or more', () => {
    expect(formatTyping(['Alice', 'Bob', 'Charlie'])).toBe('Several people are typing…')
  })
})
