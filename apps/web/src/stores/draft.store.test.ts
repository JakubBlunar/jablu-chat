import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { composerKey, flushDraftPersistence, useDraftStore, useHasDraft } from './draft.store'

jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => 'alice' }))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))

beforeEach(() => {
  flushDraftPersistence()
  localStorage.clear()
  useDraftStore.setState({ drafts: {}, files: {}, error: false })
})

it('keeps text and reply drafts separate by account, conversation, and thread', () => {
  const channel = composerKey('alice', 'channel', 'general')
  const dm = composerKey('alice', 'dm', 'general')
  const thread = composerKey('alice', 'channel', 'general', 'thread')
  const other = composerKey('bob', 'channel', 'general')
  useDraftStore
    .getState()
    .update(channel, { text: 'hello', reply: { id: 'parent', content: 'question', authorName: 'Bob' } })
  useDraftStore.getState().update(thread, { text: 'thread reply' })
  useDraftStore.getState().update(dm, { text: 'private' })
  expect(useDraftStore.getState().drafts[channel].reply?.id).toBe('parent')
  expect(useDraftStore.getState().drafts[thread].text).toBe('thread reply')
  expect(useDraftStore.getState().drafts[other]).toBeUndefined()
  expect(useDraftStore.getState().drafts[dm].text).toBe('private')
})

it('restores text and reply context after a store restart', async () => {
  const key = composerKey('alice', 'channel', 'general')
  useDraftStore
    .getState()
    .update(key, { text: 'unsent', reply: { id: 'parent', content: 'question', authorName: 'Bob' } })
  flushDraftPersistence()
  const saved = localStorage.getItem('jablu-drafts')!
  useDraftStore.setState({ drafts: {} })
  flushDraftPersistence()
  localStorage.setItem('jablu-drafts', saved)
  await useDraftStore.persist.rehydrate()
  expect(useDraftStore.getState().drafts[key].text).toBe('unsent')
  expect(useDraftStore.getState().drafts[key].reply?.id).toBe('parent')
})

it('coalesces serialization and writes within 250ms, and flushes the latest text on close', () => {
  flushDraftPersistence()
  jest.useFakeTimers()
  const key = composerKey('alice', 'channel', 'general')
  const write = jest.spyOn(Storage.prototype, 'setItem')
  const serialize = jest.spyOn(JSON, 'stringify')
  try {
    for (let i = 0; i < 100; i++) useDraftStore.getState().update(key, { text: `draft ${i}` })
    expect(useDraftStore.getState().drafts[key].text).toBe('draft 99')
    expect(write).not.toHaveBeenCalled()
    expect(serialize).not.toHaveBeenCalled()
    jest.advanceTimersByTime(250)
    expect(write).toHaveBeenCalledTimes(1)
    useDraftStore.getState().update(key, { text: 'last keystroke' })
    window.dispatchEvent(new Event('pagehide'))
    expect(JSON.parse(localStorage.getItem('jablu-drafts')!).state.drafts[key].text).toBe('last keystroke')
  } finally { flushDraftPersistence(); write.mockRestore(); serialize.mockRestore(); jest.useRealTimers() }
})

it('removes the badge state only after text, reply and files are cleared', () => {
  const key = composerKey('alice', 'channel', 'general')
  useDraftStore.getState().update(key, { text: 'unsent', fileCount: 1 })
  useDraftStore.getState().update(key, { text: '' })
  expect(useDraftStore.getState().drafts[key].fileCount).toBe(1)
  useDraftStore.getState().update(key, { fileCount: 0 })
  expect(useDraftStore.getState().drafts[key]).toBeUndefined()
})

it('includes thread-only drafts in the channel indicator without crossing accounts', () => {
  const { result } = renderHook(() => useHasDraft('channel', 'general'))
  act(() => useDraftStore.getState().update(composerKey('bob', 'channel', 'general', 'thread'), { text: 'private' }))
  expect(result.current).toBe(false)
  act(() =>
    useDraftStore.getState().update(composerKey('alice', 'channel', 'general', 'thread'), { text: 'thread draft' })
  )
  expect(result.current).toBe(true)
})
