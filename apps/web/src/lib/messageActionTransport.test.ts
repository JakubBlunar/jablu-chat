import { requestMessageAction } from './messageActionTransport'
import { messageActionError } from './messageActionError'

const mockAck = jest.fn()
const mockTimeout = jest.fn(() => ({ emitWithAck: mockAck }))
const mockSocket = { connected: true, timeout: mockTimeout }
jest.mock('@/lib/socket', () => ({ getSocket: () => mockSocket }))

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

it.each([undefined, null, {}, { ok: 'yes' }])('rejects malformed confirmations: %p', async (response) => {
  mockAck.mockResolvedValueOnce(response)
  await expect(requestMessageAction('message:edit', { messageId: 'm', content: 'text' })).rejects.toThrow('unconfirmed')
})

it('preserves explicit server rejection details for localized feedback', async () => {
  mockAck.mockResolvedValueOnce({ ok: false, error: 'Edit blocked' })
  const error = await requestMessageAction('message:edit', { messageId: 'm', content: 'text' }).catch(
    (error: unknown) => error
  )
  expect(error).toBeInstanceOf(Error)
  expect(messageActionError(error)).toBe('Edit blocked')
})

// Compiled by typecheck, never sent to a socket.
function eventContractChecks() {
  // @ts-expect-error Unknown event.
  void requestMessageAction('message:edti', { messageId: 'm', content: 'text' })
  // @ts-expect-error DM actions require their conversation context.
  void requestMessageAction('dm:delete', { messageId: 'm' })
  // @ts-expect-error Edit payloads must contain content, not an arbitrary text property.
  void requestMessageAction('message:edit', { messageId: 'm', text: 'text' })
  // @ts-expect-error Callers cannot select an arbitrary acknowledgement shape.
  void requestMessageAction<{ ok: boolean; invented: number }>('message:delete', { messageId: 'm' })
}
it('keeps negative event contracts available to the type checker', () => {
  expect(typeof eventContractChecks).toBe('function')
})
