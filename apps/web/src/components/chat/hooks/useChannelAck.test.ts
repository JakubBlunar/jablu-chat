import { renderHook } from '@testing-library/react'

jest.mock('@/lib/api', () => ({
  api: {
    ackServer: jest.fn().mockResolvedValue(undefined),
    ackChannel: jest.fn().mockResolvedValue(undefined),
    ackDm: jest.fn().mockResolvedValue(undefined),
    getReadStates: jest.fn()
  }
}))

// voice-connection.store transitively imports livekit-client which requires
// TextEncoder (not present in jsdom). Stub it so the hook can read its flag.
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: {
    getState: jest.fn(() => ({ viewingVoiceRoom: false })),
    setState: (next: Record<string, unknown>) => {
      const get = (require('@/stores/voice-connection.store') as { useVoiceConnectionStore: { getState: jest.Mock } })
        .useVoiceConnectionStore.getState
      const current = get()
      get.mockReturnValue({ ...current, ...next })
    }
  }
}))

import { useChannelAck } from './useChannelAck'
import { useReadStateStore } from '@/stores/readState.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

function makeMocks() {
  const ackChannel = jest.fn()
  const ackDm = jest.fn()
  const captureChannelView = jest.fn()
  const captureDmView = jest.fn()
  const clearChannelView = jest.fn()
  const clearDmView = jest.fn()
  useReadStateStore.setState({
    ackChannel,
    ackDm,
    captureChannelView,
    captureDmView,
    clearChannelView,
    clearDmView
  } as any)
  return { ackChannel, ackDm, captureChannelView, captureDmView, clearChannelView, clearDmView }
}

beforeEach(() => {
  jest.clearAllMocks()
  useVoiceConnectionStore.setState({ viewingVoiceRoom: false } as any)
})

describe('useChannelAck', () => {
  it('captures snapshot and acks the channel on mount', () => {
    const m = makeMocks()
    renderHook(() => useChannelAck('channel', 'ch-1'))
    expect(m.captureChannelView).toHaveBeenCalledWith('ch-1')
    expect(m.ackChannel).toHaveBeenCalledWith('ch-1')
  })

  it('captures snapshot and acks the DM on mount', () => {
    const m = makeMocks()
    renderHook(() => useChannelAck('dm', 'conv-1'))
    expect(m.captureDmView).toHaveBeenCalledWith('conv-1')
    expect(m.ackDm).toHaveBeenCalledWith('conv-1')
  })

  it('does nothing when contextId is null', () => {
    const m = makeMocks()
    renderHook(() => useChannelAck('channel', null))
    expect(m.ackChannel).not.toHaveBeenCalled()
    expect(m.captureChannelView).not.toHaveBeenCalled()
  })

  it('suppresses channel ack while viewing voice room', () => {
    const m = makeMocks()
    useVoiceConnectionStore.setState({ viewingVoiceRoom: true } as any)
    renderHook(() => useChannelAck('channel', 'ch-1'))
    expect(m.ackChannel).not.toHaveBeenCalled()
  })

  it('re-acks when contextId changes', () => {
    const m = makeMocks()
    const { rerender } = renderHook(({ id }: { id: string | null }) => useChannelAck('channel', id), {
      initialProps: { id: 'ch-1' }
    })
    expect(m.ackChannel).toHaveBeenCalledTimes(1)
    expect(m.ackChannel).toHaveBeenLastCalledWith('ch-1')

    rerender({ id: 'ch-2' })
    // cleanup acks ch-1 + clears its snapshot, then new effect acks ch-2
    expect(m.ackChannel).toHaveBeenCalledWith('ch-2')
    expect(m.clearChannelView).toHaveBeenCalledWith('ch-1')
  })

  it('clears snapshot and acks on unmount', () => {
    const m = makeMocks()
    const { unmount } = renderHook(() => useChannelAck('channel', 'ch-1'))
    unmount()
    expect(m.clearChannelView).toHaveBeenCalledWith('ch-1')
  })

  it('re-acks on visibility change to visible', () => {
    const m = makeMocks()
    renderHook(() => useChannelAck('channel', 'ch-1'))
    // initial mount call
    expect(m.ackChannel).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(m.ackChannel).toHaveBeenCalledTimes(2)
  })
})
