import type { DmCall } from '@chat/shared'
import { useDmCallStore } from './dmCall.store'
import { useDmStore } from './dm.store'
import { useVoiceStore } from './voice.store'

const emit = jest.fn()
const ack = jest.fn()
const join = jest.fn()
const voice: {
  currentDmCallId: string | null
  currentChannelId: string | null
  room: object | null
  disconnect: jest.Mock
} = {
  currentDmCallId: null,
  currentChannelId: null,
  room: null,
  disconnect: jest.fn()
}
jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ connected: true, emit, timeout: () => ({ emitWithAck: ack }) })
}))
jest.mock('@/lib/voiceConnect', () => ({ joinDmCall: (...args: unknown[]) => join(...args) }))
jest.mock('./voice-connection.store', () => ({ useVoiceConnectionStore: { getState: () => voice } }))
jest.mock('./auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'alice' } }) } }))

const call: DmCall = {
  id: 'call',
  conversationId: 'dm',
  callerId: 'alice',
  callerName: 'Alice',
  createdAt: '',
  ringingUntil: '',
  ringingUserIds: ['bob'],
  participants: [{ userId: 'alice', username: 'Alice' }]
}

beforeEach(() => {
  jest.clearAllMocks()
  voice.currentDmCallId = null
  voice.currentChannelId = null
  voice.room = null
  voice.disconnect.mockImplementation(() => {
    voice.currentDmCallId = null
    voice.currentChannelId = null
    voice.room = null
  })
  join.mockImplementation(async (id: string, conversationId: string) => {
    voice.currentDmCallId = id
    voice.currentChannelId = conversationId
    voice.room = {}
  })
  useDmCallStore.setState({ calls: {}, busy: false, error: null })
  useVoiceStore.getState().reset()
  useDmStore.setState({
    conversations: [
      {
        id: 'dm',
        isGroup: false,
        groupName: null,
        createdAt: '',
        members: [
          {
            userId: 'bob',
            username: 'bob',
            displayName: 'Bob',
            avatarUrl: null,
            bio: null,
            status: 'online',
            createdAt: ''
          }
        ]
      }
    ]
  })
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

it('starts an outgoing call and reuses the shared voice connection', async () => {
  ack.mockResolvedValueOnce({ ok: true, data: call })
  expect(await useDmCallStore.getState().start('dm')).toBe(true)
  expect(ack).toHaveBeenCalledWith('dm:call:start', { conversationId: 'dm' })
  expect(join).toHaveBeenCalledWith('call', 'dm', 'Bob', expect.any(Function))
  expect(useDmCallStore.getState().busy).toBe(false)
})

it('does not connect or acquire media when a call is merely ringing', () => {
  useDmCallStore.getState().update(call)
  expect(join).not.toHaveBeenCalled()
  expect(useVoiceStore.getState().participants.dm).toEqual(call.participants)
})

it('only accepts explicitly and leaves the previous call first', async () => {
  voice.currentDmCallId = 'old'
  voice.currentChannelId = 'other'
  ack.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true, data: call })
  expect(await useDmCallStore.getState().accept(call)).toBe(true)
  expect(ack.mock.calls.map(([event]) => event)).toEqual(['dm:call:leave', 'dm:call:accept'])
  expect(voice.disconnect).toHaveBeenCalled()
})

it('declines without connecting and surfaces server failures', async () => {
  ack.mockResolvedValueOnce({ ok: true })
  await useDmCallStore.getState().decline('call')
  expect(join).not.toHaveBeenCalled()
  ack.mockResolvedValueOnce({ ok: false, error: 'This call has ended' })
  expect(await useDmCallStore.getState().accept(call)).toBe(false)
  expect(useDmCallStore.getState().error).toBe('This call has ended')
  expect(useDmCallStore.getState().busy).toBe(false)
})

it('leaves the server call when the media connection fails', async () => {
  ack.mockResolvedValueOnce({ ok: true, data: call })
  join.mockRejectedValueOnce(new Error('No media server'))
  expect(await useDmCallStore.getState().start('dm')).toBe(false)
  expect(emit).toHaveBeenCalledWith('dm:call:leave', { callId: 'call' })
  expect(useDmCallStore.getState().error).toBe('No media server')
})

it('stops local capture on hangup and removes the call and participants', () => {
  useDmCallStore.getState().update(call)
  voice.currentDmCallId = 'call'
  useDmCallStore.getState().ended({ callId: 'call', reason: 'hangup' })
  expect(voice.disconnect).toHaveBeenCalled()
  expect(useDmCallStore.getState().calls).toEqual({})
  expect(useVoiceStore.getState().participants.dm).toBeUndefined()
})

it('shows no-answer status for timed-out outgoing calls', () => {
  useDmCallStore.getState().update(call)
  useDmCallStore.getState().ended({ callId: 'call', reason: 'timeout' })
  expect(useDmCallStore.getState().error).toBe('No answer')
})

it('resynchronizes current calls after reconnect', async () => {
  ack.mockResolvedValueOnce({ ok: true, data: [call] })
  await useDmCallStore.getState().sync()
  expect(useDmCallStore.getState().calls).toEqual({ call })
})

it('does not resurrect a call after logout or signaling reset', async () => {
  let resolve!: (reply: object) => void
  ack.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const start = useDmCallStore.getState().start('dm')
  await Promise.resolve()
  useDmCallStore.getState().reset()
  resolve({ ok: true, data: call })
  expect(await start).toBe(false)
  expect(join).not.toHaveBeenCalled()
  expect(useDmCallStore.getState().calls).toEqual({})
  expect(useDmCallStore.getState().busy).toBe(false)
})
