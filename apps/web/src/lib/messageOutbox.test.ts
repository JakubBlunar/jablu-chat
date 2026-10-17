import 'fake-indexeddb/auto'
import { waitFor } from '@testing-library/react'
import { io, type Socket } from 'socket.io-client'
import { composerTransaction } from './composerDb'
import { startMessageOutbox } from './messageOutbox'
import { useOutboxStore } from '@/stores/outbox.store'
import { useMessageStore } from '@/stores/message.store'
import { composerKey, useDraftStore } from '@/stores/draft.store'
import { api } from '@/lib/api'
import { makeMessage } from '@/test/factories'

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
  await composerTransaction<void>('files', 'readwrite', (store, done) => {
    store.clear()
    done()
  })
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
  useDraftStore.setState({ drafts: {}, files: {}, error: false })
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

it('retains the stable ID when restoring a file-only message', async () => {
  await useOutboxStore.getState().enqueue({ ...input, content: '', files: [new File(['x'], 'a.txt')] })
  const item = useOutboxStore.getState().items[0]
  await composerTransaction<void>('outbox', 'readwrite', (store, done) => {
    store.put({ ...item, status: 'failed' })
    done()
  })
  await useOutboxStore.getState().restore(item.id)
  const key = composerKey('alice', 'channel', 'general')
  expect(useDraftStore.getState().drafts[key]).toMatchObject({ outboxId: item.id, fileCount: 1 })
  expect(useDraftStore.getState().files[key]).toHaveLength(1)
})

it('restores a failed message without overwriting another draft or deleting the failed backup', async () => {
  await useOutboxStore
    .getState()
    .enqueue({ ...input, reply: { id: 'parent', content: 'Question', authorName: 'Bob' }, replyToId: 'parent' })
  const id = useOutboxStore.getState().items[0].id
  await composerTransaction<void>('outbox', 'readwrite', (store, done) => {
    store.put({ ...useOutboxStore.getState().items[0], status: 'failed' })
    done()
  })
  const key = composerKey('alice', 'channel', 'general')
  useDraftStore.getState().update(key, { text: 'Do not replace me' })
  await expect(useOutboxStore.getState().restore(id)).rejects.toThrow('outboxDraftOccupied')
  expect(useDraftStore.getState().drafts[key].text).toBe('Do not replace me')
  useDraftStore.getState().update(key, { text: '' })
  await useOutboxStore.getState().restore(id)
  expect(useDraftStore.getState().drafts[key]).toMatchObject({
    text: input.content,
    outboxId: id,
    reply: { id: 'parent', authorName: 'Bob' }
  })
  await useOutboxStore.getState().refresh('alice')
  expect(useOutboxStore.getState().items[0]).toMatchObject({ id, status: 'failed' })
  await useOutboxStore.getState().enqueue({ ...input, content: 'Edited', clientMessageId: id })
  expect(useOutboxStore.getState().items).toHaveLength(1)
  expect(useOutboxStore.getState().items[0]).toMatchObject({
    id,
    content: 'Edited',
    status: 'queued',
    attachmentIds: []
  })
  await expect(useOutboxStore.getState().enqueue({ ...input, clientMessageId: id })).rejects.toThrow('outboxChanged')
})

it('publishes upload progress and waits for acknowledgement before clearing the outgoing message', async () => {
  const file = new File(['12345678'], 'eight.txt')
  Object.defineProperties(file, {
    name: { value: 'eight.txt', enumerable: true },
    size: { value: 8, enumerable: true }
  })
  await useOutboxStore.getState().enqueue({ ...input, files: [file] })
  const id = useOutboxStore.getState().items[0].id
  let completeUpload!: (attachment: Awaited<ReturnType<typeof api.uploadAttachment>>) => void
  jest.mocked(api.uploadAttachment).mockImplementation((_file, progress) => {
    progress?.(4, 8)
    return new Promise((resolve) => {
      completeUpload = resolve
    })
  })
  let acknowledge!: (response: { ok: boolean; message: ReturnType<typeof makeMessage> }) => void
  jest.spyOn(mockSocket, 'emitWithAck').mockImplementation(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve
      })
  )
  mockSocket.connected = true
  stop = startMessageOutbox(mockSocket, 'alice')
  await waitFor(() =>
    expect(useOutboxStore.getState().progress[id]).toMatchObject({ fileIndex: 0, loaded: 4, total: 8 })
  )
  completeUpload({
    id: 'file1',
    messageId: null,
    filename: 'eight.txt',
    url: '/file',
    type: 'file',
    mimeType: 'text/plain',
    sizeBytes: 8,
    width: null,
    height: null,
    thumbnailUrl: null
  })
  await waitFor(() => expect(useOutboxStore.getState().progress[id]?.fileIndex).toBe(1))
  expect(useOutboxStore.getState().items).toHaveLength(1)
  acknowledge({ ok: true, message: makeMessage({ id, authorId: 'alice', channelId: 'general' }) })
  await waitFor(() => expect(useOutboxStore.getState().items).toHaveLength(0))
  expect(useOutboxStore.getState().progress[id]).toBeUndefined()
})
