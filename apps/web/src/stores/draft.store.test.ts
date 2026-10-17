import 'fake-indexeddb/auto'
import { composerKey, useDraftStore } from './draft.store'

jest.mock('@/stores/auth.store', () => ({ useAuthStore: () => 'alice' }))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))

beforeEach(() => {
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
  const saved = localStorage.getItem('jablu-drafts')!
  useDraftStore.setState({ drafts: {} })
  localStorage.setItem('jablu-drafts', saved)
  await useDraftStore.persist.rehydrate()
  expect(useDraftStore.getState().drafts[key].text).toBe('unsent')
  expect(useDraftStore.getState().drafts[key].reply?.id).toBe('parent')
})

it('removes the badge state only after text, reply and files are cleared', () => {
  const key = composerKey('alice', 'channel', 'general')
  useDraftStore.getState().update(key, { text: 'unsent', fileCount: 1 })
  useDraftStore.getState().update(key, { text: '' })
  expect(useDraftStore.getState().drafts[key].fileCount).toBe(1)
  useDraftStore.getState().update(key, { fileCount: 0 })
  expect(useDraftStore.getState().drafts[key]).toBeUndefined()
})
