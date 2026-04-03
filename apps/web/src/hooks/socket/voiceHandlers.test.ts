jest.mock('@/lib/sounds', () => ({
  playJoinSound: jest.fn(),
  playLeaveSound: jest.fn(),
}))

jest.mock('@/lib/voiceConnect', () => ({
  joinVoiceChannel: jest.fn(),
}))

jest.mock('@/stores/voice-connection.store', () => {
  const { create } = require('zustand')
  return {
    useVoiceConnectionStore: create(() => ({
      currentChannelId: null as string | null,
      currentServerId: null as string | null,
    }))
  }
})

import { createVoiceHandlers } from './voiceHandlers'
import { playJoinSound, playLeaveSound } from '@/lib/sounds'
import { joinVoiceChannel } from '@/lib/voiceConnect'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'

function resetStores() {
  useAuthStore.setState({ user: { id: 'me' } } as any)
  useVoiceStore.setState({
    participants: {},
    setAll: jest.fn(),
    addParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    updateParticipantState: jest.fn(),
  } as any)
  useVoiceConnectionStore.setState({
    currentChannelId: 'vc1',
    currentServerId: 's1',
  } as any)
  useChannelStore.setState({
    channels: [{ id: 'vc2', name: 'AFK Room' }],
  } as any)
}

let handlers: ReturnType<typeof createVoiceHandlers>

beforeEach(() => {
  resetStores()
  jest.clearAllMocks()
  handlers = createVoiceHandlers()
})

describe('onVoiceParticipants', () => {
  it('sets all participants', () => {
    const state = { vc1: [{ userId: 'u1', username: 'alice' }] }
    handlers.onVoiceParticipants(state)

    expect(useVoiceStore.getState().setAll).toHaveBeenCalledWith(state)
  })
})

describe('onVoiceParticipantJoined', () => {
  it('adds participant to voice store', () => {
    handlers.onVoiceParticipantJoined({ channelId: 'vc1', userId: 'u1', username: 'alice' })

    expect(useVoiceStore.getState().addParticipant).toHaveBeenCalledWith('vc1', {
      userId: 'u1',
      username: 'alice'
    })
  })

  it('plays join sound when another user joins my channel', () => {
    handlers.onVoiceParticipantJoined({ channelId: 'vc1', userId: 'u1', username: 'alice' })

    expect(playJoinSound).toHaveBeenCalled()
  })

  it('does NOT play join sound for self', () => {
    handlers.onVoiceParticipantJoined({ channelId: 'vc1', userId: 'me', username: 'me' })

    expect(playJoinSound).not.toHaveBeenCalled()
  })

  it('does NOT play join sound for different channel', () => {
    handlers.onVoiceParticipantJoined({ channelId: 'other-vc', userId: 'u1', username: 'alice' })

    expect(playJoinSound).not.toHaveBeenCalled()
  })
})

describe('onVoiceParticipantLeft', () => {
  it('removes participant from voice store', () => {
    handlers.onVoiceParticipantLeft({ channelId: 'vc1', userId: 'u1' })

    expect(useVoiceStore.getState().removeParticipant).toHaveBeenCalledWith('vc1', 'u1')
  })

  it('plays leave sound when another user leaves my channel', () => {
    handlers.onVoiceParticipantLeft({ channelId: 'vc1', userId: 'u1' })

    expect(playLeaveSound).toHaveBeenCalled()
  })

  it('does NOT play leave sound for self', () => {
    handlers.onVoiceParticipantLeft({ channelId: 'vc1', userId: 'me' })

    expect(playLeaveSound).not.toHaveBeenCalled()
  })
})

describe('onVoiceParticipantState', () => {
  it('updates participant state', () => {
    handlers.onVoiceParticipantState({ channelId: 'vc1', userId: 'u1', muted: true })

    expect(useVoiceStore.getState().updateParticipantState).toHaveBeenCalledWith(
      'vc1', 'u1', { muted: true }
    )
  })

  it('only passes defined state fields', () => {
    handlers.onVoiceParticipantState({ channelId: 'vc1', userId: 'u1', camera: true })

    expect(useVoiceStore.getState().updateParticipantState).toHaveBeenCalledWith(
      'vc1', 'u1', { camera: true }
    )
  })
})

describe('onVoiceMoved', () => {
  it('joins the new voice channel for self', () => {
    handlers.onVoiceMoved({ userId: 'me', fromChannelId: 'vc1', toChannelId: 'vc2' })

    expect(joinVoiceChannel).toHaveBeenCalledWith('s1', 'vc2', 'AFK Room')
  })

  it('ignores events for other users', () => {
    handlers.onVoiceMoved({ userId: 'other', fromChannelId: 'vc1', toChannelId: 'vc2' })

    expect(joinVoiceChannel).not.toHaveBeenCalled()
  })

  it('falls back to "AFK" when channel not found', () => {
    handlers.onVoiceMoved({ userId: 'me', fromChannelId: 'vc1', toChannelId: 'unknown' })

    expect(joinVoiceChannel).toHaveBeenCalledWith('s1', 'unknown', 'AFK')
  })
})
