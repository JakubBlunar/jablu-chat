import 'fake-indexeddb/auto'
import { waitFor } from '@testing-library/react'
import { io, type Socket } from 'socket.io-client'
import { composerTransaction } from './composerDb'
import { startMessageOutbox } from './messageOutbox'
import { useOutboxStore } from '@/stores/outbox.store'
import { useMessageStore } from '@/stores/message.store'

let mockSocket: Socket
let mockUserId = 'alice'
jest.mock('@/lib/socket', () => ({ getSocket: () => mockSocket }))
jest.mock('@/stores/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: mockUserId } }) } }))
jest.mock('@/lib/api', () => ({
  api: { uploadAttachment: jest.fn(), getMaxUploadSizeMb: jest.fn().mockResolvedValue(50) },
  ApiError: class extends Error {}
}))
jest.mock('@/stores/message.store', () => ({
  useMessageStore: { getState: () => ({ loadedForChannelId: 'general', hasNewer: false, addMessage: mockAddMessage }) }
}))
jest.mock('@/stores/dm.store', () => ({ useDmStore: { getState: () => ({ loadedForConvId: null }) } }))
jest.mock('@/stores/thread.store', () => ({ useThreadStore: { getState: () => ({ parentMessage: null }) } }))
jest.mock('@/stores/forum.store', () => ({ useForumStore: { getState: () => ({ currentPostId: null }) } }))
jest.mock('@/lib/cache/contextMutations', () => ({ cacheAddMessage: jest.fn() }))
jest.mock('@/lib/cache/messageCache', () => ({ channelKey: (id: string) => id, dmKey: (id: string) => id }))
const mockAddMessage = jest.fn()
let stop: (() => void) | undefined
const input = {
  userId: 'alice',
  mode: 'channel' as const,
  contextId: 'general',
  content: 'From the mountains',
  files: []
}

beforeEach(async () => {
  await composerTransaction<void>('outbox', 'readwrite', (store, done) => {
    store.clear()
    done()
  })
  mockUserId = 'alice'
  mockSocket = io('http://localhost:1', { autoConnect: false })
  mockSocket.connected = false
  jest.spyOn(mockSocket, 'timeout').mockReturnValue(mockSocket)
  mockAddMessage.mockClear()
  useOutboxStore.setState({ userId: 'alice', items: [], error: null })
})
afterEach(() => {
  stop?.()
  stop = undefined
  mockSocket.connected = false
  mockSocket.disconnect()
  jest.restoreAllMocks()
})

it('durably queues offline, survives restart, and sends on reconnect', async () => {
  await useOutboxStore.getState().enqueue(input)
  const id = useOutboxStore.getState().items[0].id
  useOutboxStore.setState({ items: [] })
  stop = startMessageOutbox(mockSocket, 'alice')
  await waitFor(() => expect(useOutboxStore.getState().items[0]?.id).toBe(id))
  const send = jest.spyOn(mockSocket, 'emitWithAck').mockResolvedValue({
    ok: true,
    message: { id, authorId: 'alice', channelId: 'general', directConversationId: null, content: input.content }
  })
  mockSocket.connected = true
  window.dispatchEvent(new Event('online'))
  await waitFor(() => expect(useOutboxStore.getState().items).toHaveLength(0))
  expect(send).toHaveBeenCalledWith(
    'message:send',
    expect.objectContaining({ clientMessageId: id, content: input.content })
  )
  expect(useMessageStore.getState().addMessage).toHaveBeenCalledTimes(1)
})

it('keeps a rejected message visible and retries with the same ID', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  await useOutboxStore.getState().enqueue(input)
  const id = useOutboxStore.getState().items[0].id
  const send = jest
    .spyOn(mockSocket, 'emitWithAck')
    .mockResolvedValue({ ok: false, error: 'Permission denied', retryable: false })
  mockSocket.connected = true
  stop = startMessageOutbox(mockSocket, 'alice')
  await waitFor(() => expect(useOutboxStore.getState().items[0]?.status).toBe('failed'))
  expect(useOutboxStore.getState().items[0].content).toBe(input.content)
  send.mockResolvedValue({
    ok: true,
    message: { id, authorId: 'alice', channelId: 'general', directConversationId: null }
  })
  await useOutboxStore.getState().retry(id)
  await waitFor(() => expect(useOutboxStore.getState().items).toHaveLength(0), { timeout: 3000 })
  expect(send.mock.calls.every(([, payload]) => payload.clientMessageId === id)).toBe(true)
})

it('does not send another account’s queued messages', async () => {
  await useOutboxStore.getState().enqueue(input)
  mockUserId = 'bob'
  mockSocket.connected = true
  const send = jest.spyOn(mockSocket, 'emitWithAck')
  stop = startMessageOutbox(mockSocket, 'bob')
  await useOutboxStore.getState().refresh('bob')
  expect(useOutboxStore.getState().items).toHaveLength(0)
  expect(send).not.toHaveBeenCalled()
  useOutboxStore.setState({ userId: 'alice' })
  await useOutboxStore.getState().refresh('alice')
  expect(useOutboxStore.getState().items).toHaveLength(1)
})

it('does not clear the composer on storage quota failure', async () => {
  const failure = jest.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
    throw new DOMException('Full', 'QuotaExceededError')
  })
  await expect(useOutboxStore.getState().enqueue(input)).rejects.toThrow('Full')
  expect(useOutboxStore.getState().items).toHaveLength(0)
  failure.mockRestore()
})
