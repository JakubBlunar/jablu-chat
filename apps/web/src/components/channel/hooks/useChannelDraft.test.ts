import { act, renderHook } from '@testing-library/react'
import { makeChannel } from '@/test/factories'
import { normalizeChannelName, useChannelDraft } from './useChannelDraft'

it('normalizes pasted names and preserves invalid empty input for validation', () => {
  expect(normalizeChannelName('  General   CHAT!! ')).toBe('general-chat')
  expect(normalizeChannelName('---')).toBe('')
})

it('preserves unsaved edits on a same-channel refresh and resets for a different channel', () => {
  const channel = makeChannel('one', 'server', { description: 'Original' })
  const { result, rerender } = renderHook(({ channel }) => useChannelDraft(channel), { initialProps: { channel } })
  act(() => result.current.setDescription('Unsaved'))
  rerender({ channel: { ...channel, description: 'Remote change' } })
  expect(result.current.description).toBe('Unsaved')
  rerender({ channel: makeChannel('two', 'server', { description: 'Second channel', categoryId: 'category' }) })
  expect(result.current.rawName).toBe('two')
  expect(result.current.description).toBe('Second channel')
  expect(result.current.categoryId).toBe('category')
})

it('starts a fresh create draft when the requested category changes', () => {
  const { result, rerender } = renderHook(({ category }) => useChannelDraft(undefined, category), {
    initialProps: { category: 'one' }
  })
  act(() => result.current.setRawName('Pending'))
  rerender({ category: 'two' })
  expect(result.current.rawName).toBe('')
  expect(result.current.categoryId).toBe('two')
})
