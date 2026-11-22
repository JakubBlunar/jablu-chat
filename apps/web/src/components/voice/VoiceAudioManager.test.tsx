import { act, render } from '@testing-library/react'
import { Track, RoomEvent } from 'livekit-client'
import { VoiceAudioManager } from './VoiceAudioManager'
import { useSettingsStore } from '@/stores/settings.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

jest.mock('livekit-client', () => ({
  Track: { Source: { Microphone: 'mic', ScreenShareAudio: 'screen' } },
  RoomEvent: {
    TrackSubscribed: 'subscribed',
    TrackUnsubscribed: 'unsubscribed',
    ParticipantConnected: 'joined',
    ParticipantDisconnected: 'left',
    Disconnected: 'disconnected'
  }
}))
jest.mock('@/stores/voice-connection.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return {
    useVoiceConnectionStore: create(() => ({
      room: null,
      isDeafened: false,
      volumeOverrides: {},
      audioOutputDeviceId: '',
      setAudioOutputError: jest.fn(),
      setPlaybackBlocked: jest.fn()
    }))
  }
})

it('applies output and user volumes to existing and newly received tracks and preserves deafen', async () => {
  const gains: { gain: { value: number }; connect: jest.Mock; disconnect: jest.Mock }[] = []
  const panners: { pan: { value: number }; connect: jest.Mock; disconnect: jest.Mock }[] = []
  class FakeAudioContext extends EventTarget {
    state = 'running'
    destination = {}
    createGain() {
      const gain = { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() }
      gains.push(gain)
      return gain
    }
    createMediaElementSource() {
      return { connect: jest.fn(), disconnect: jest.fn() }
    }
    createStereoPanner() {
      const panner = { pan: { value: 0 }, connect: jest.fn(), disconnect: jest.fn() }
      panners.push(panner)
      return panner
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', { value: FakeAudioContext, configurable: true })
  Object.defineProperty(globalThis, 'MediaStream', { value: class {}, configurable: true })
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const listeners = new Map<string, () => void>()
  const participant = (identity: string, screen = false) => ({
    identity,
    getTrackPublication: (source: string) =>
      source === Track.Source.Microphone
        ? { track: { mediaStreamTrack: { id: identity, readyState: 'live' } } }
        : screen && source === Track.Source.ScreenShareAudio
          ? { track: { mediaStreamTrack: { id: identity + '-screen', readyState: 'live' } } }
          : undefined
  })
  const room = {
    localParticipant: { identity: 'listener' },
    remoteParticipants: new Map([['first', participant('first')]]),
    on: (event: string, callback: () => void) => {
      listeners.set(event, callback)
    },
    off: jest.fn()
  }
  useSettingsStore.getState().setVoiceOutputVolume(50)
  useVoiceConnectionStore.setState({ room: room as never, isDeafened: false, volumeOverrides: { first: 150 } })
  const { unmount } = render(<VoiceAudioManager />)
  try {
    await act(async () => {
      await Promise.resolve()
    })
    expect(gains[0].gain.value).toBe(0.75)
    act(() => useSettingsStore.getState().setVoiceOutputVolume(80))
    expect(gains[0].gain.value).toBeCloseTo(1.2)
    act(() => {
      room.remoteParticipants.set('second', participant('second'))
      listeners.get(RoomEvent.TrackSubscribed)?.()
    })
    expect(gains[1].gain.value).toBe(0.8)
    expect(panners).toHaveLength(0)
    act(() => useSettingsStore.getState().setSeparateVoices(true))
    expect(panners.map((node) => node.pan.value)).toEqual([-0.75, 0.75])
    expect(panners[0].connect).toHaveBeenCalledWith(gains[0])
    act(() => useVoiceConnectionStore.setState({ isDeafened: true }))
    expect(gains.map((gain) => gain.gain.value)).toEqual([0, 0])
    act(() => useSettingsStore.getState().setVoiceOutputVolume(60))
    expect(gains.map((gain) => gain.gain.value)).toEqual([0, 0])
    act(() => useVoiceConnectionStore.setState({ isDeafened: false }))
    expect(gains[0].gain.value).toBeCloseTo(0.9)
    expect(gains[1].gain.value).toBe(0.6)
    act(() => {
      room.remoteParticipants.set('third', participant('third', true))
      listeners.get(RoomEvent.TrackSubscribed)?.()
    })
    expect(gains).toHaveLength(4)
    expect(panners.map((node) => node.pan.value)).toEqual([-0.75, 0.75, -0.25])
    act(() => useSettingsStore.getState().setSeparateVoices(false))
    expect(panners.every((node) => node.disconnect.mock.calls.length === 1)).toBe(true)
    expect(gains).toHaveLength(4)
    act(() => useSettingsStore.getState().setSeparateVoices(true))
    expect(panners.slice(3).map((node) => node.pan.value)).toEqual([-0.75, 0.75, -0.25])
  } finally {
    unmount()
    useSettingsStore.getState().setSeparateVoices(false)
    useSettingsStore.getState().setVoiceOutputVolume(100)
    jest.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'AudioContext')
    Reflect.deleteProperty(globalThis, 'MediaStream')
  }
})
