import { setMessagePinned } from './messagePins'
import { getSocket } from './socket'
import { Manager } from 'socket.io-client'
jest.mock('./socket', () => ({ getSocket: jest.fn() }))

it('requires a live connection rather than reporting success offline', async () => {
  jest.mocked(getSocket).mockReturnValue(null)
  await expect(setMessagePinned('channel', 'ch', 'msg', false)).rejects.toThrow('offline')
})

it('waits for confirmation and surfaces rejected or timed-out updates', async () => {
  const emitWithAck = jest
    .fn()
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: false, error: 'Forbidden' })
    .mockRejectedValueOnce(new Error('timeout'))
  const socket = new Manager({ autoConnect: false }).socket('/')
  socket.connected = true
  jest.spyOn(socket, 'timeout').mockReturnValue(socket)
  jest.spyOn(socket, 'emitWithAck').mockImplementation(emitWithAck)
  jest.mocked(getSocket).mockReturnValue(socket)
  await setMessagePinned('dm', 'dm1', 'msg', false)
  expect(emitWithAck).toHaveBeenCalledWith('dm:unpin', { conversationId: 'dm1', messageId: 'msg' })
  await expect(setMessagePinned('channel', 'ch', 'msg', true)).rejects.toThrow('Forbidden')
  await expect(setMessagePinned('channel', 'ch', 'msg', true)).rejects.toThrow('unconfirmed')
})
