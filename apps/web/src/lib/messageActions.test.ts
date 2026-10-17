import { deleteMessage, editMessage, requestMessageAction } from './messageActions'
import { makeMessage } from '@/test/factories'

const mockAck = jest.fn()
const mockTimeout = jest.fn(() => ({ emitWithAck: mockAck }))
const mockSocket = { connected: true, timeout: mockTimeout }
const mockUpdate = jest.fn()
const mockRemove = jest.fn()
const mockInvalidate = jest.fn()
jest.mock('@/lib/socket', () => ({ getSocket: () => mockSocket }))
jest.mock('@/stores/translation.store', () => ({
  useTranslationStore: { getState: () => ({ invalidate: mockInvalidate, reset: jest.fn() }) }
}))
jest.mock('@/stores/message.store', () => ({
  useMessageStore: { getState: () => ({ updateMessage: mockUpdate, removeMessage: mockRemove }) }
}))
jest.mock('@/stores/dm.store', () => ({
  useDmStore: { getState: () => ({ updateMessage: mockUpdate, removeMessage: mockRemove }) }
}))
jest.mock('@/stores/thread.store', () => ({
  useThreadStore: { getState: () => ({ updateMessage: mockUpdate, deleteMessage: mockRemove }) }
}))
jest.mock('@/stores/forumReply.store', () => ({
  useForumReplyStore: { getState: () => ({ updateMessage: mockUpdate, removeMessage: mockRemove }) }
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockSocket.connected = true
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('never buffers an action while disconnected', async () => {
  mockSocket.connected = false
  await expect(requestMessageAction('message:delete', { messageId: 'm' })).rejects.toThrow('offline')
  expect(mockAck).not.toHaveBeenCalled()
})

it('bounds acknowledgements and exposes an unconfirmed operation', async () => {
  mockAck.mockRejectedValueOnce(new Error('operation has timed out'))
  await expect(requestMessageAction('message:delete', { messageId: 'm' })).rejects.toThrow('unconfirmed')
  expect(mockTimeout).toHaveBeenCalledWith(10_000)
})

it('rejects absent and rejected acknowledgements', async () => {
  mockAck.mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ok: false, error: 'Edit blocked' })
  await expect(requestMessageAction('message:edit', {})).rejects.toThrow('unconfirmed')
  await expect(requestMessageAction('message:edit', {})).rejects.toThrow('Edit blocked')
})

it('updates DM messages only after a matching confirmed response', async () => {
  const message = makeMessage({ id: 'm', content: 'new text' })
  mockAck.mockResolvedValueOnce({ ok: true, message })
  await editMessage('dm', 'conversation', 'm', 'new text')
  expect(mockAck).toHaveBeenCalledWith('dm:edit', {
    conversationId: 'conversation',
    messageId: 'm',
    content: 'new text'
  })
  expect(mockUpdate).toHaveBeenCalledTimes(1)
  expect(mockUpdate).toHaveBeenCalledWith(message)
  expect(mockInvalidate).toHaveBeenCalledWith('m')
})

it('does not treat malformed edit confirmations as success', async () => {
  mockAck.mockResolvedValueOnce({ ok: true })
  await expect(editMessage('channel', 'channel', 'm', 'text')).rejects.toThrow('unconfirmed')
  expect(mockUpdate).not.toHaveBeenCalled()
})

it('does not remove a message on rejection; removes all channel copies after confirmation', async () => {
  const message = makeMessage()
  mockAck.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true })
  await expect(deleteMessage('channel', 'channel', message)).rejects.toThrow()
  expect(mockRemove).not.toHaveBeenCalled()
  await deleteMessage('channel', 'channel', message)
  expect(mockRemove).toHaveBeenCalledTimes(3)
})
