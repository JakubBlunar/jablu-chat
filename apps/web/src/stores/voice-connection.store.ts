import { create } from 'zustand'
import { Track, type Room } from 'livekit-client'
import { isElectron } from '@/lib/electron'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { type MicMode, getMicMode, startMicMode, stopMicMode, setRoomGetter } from '@/lib/micMode'
import { stopRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'
import { setLocalMicTransmissionEnabled } from '@/lib/voiceLocalMic'
import { enqueueMicrophoneOperation } from '@/lib/voiceMicOperations'
import { type CameraQuality, CAMERA_PRESETS, getSavedCamera } from '@/lib/deviceSettings'
import type { BlurHandle } from '@/lib/backgroundBlur'

function normalizedMicMode(): MicMode {
  const saved = getMicMode()
  if (saved === 'push-to-talk' && !isElectron) return 'activity'
  return saved
}

function emitVoiceState(state: { muted?: boolean; deafened?: boolean; camera?: boolean; screenShare?: boolean }) {
  const callId = useVoiceConnectionStore.getState().currentDmCallId
  if (callId) getSocket()?.emit('dm:call:state', { callId, ...state })
  else getSocket()?.emit('voice:state', state)
}

export type VoiceNetworkDropout = {
  serverId: string
  channelId: string
  channelName: string
}

export type VoiceConnectionState = {
  currentServerId: string | null
  currentDmCallId: string | null
  currentChannelId: string | null
  currentChannelName: string | null
  room: Room | null
  isMuted: boolean
  isDeafened: boolean
  isCameraOn: boolean
  isScreenSharing: boolean
  isConnecting: boolean
  isReconnecting: boolean
  connectedAt: number | null
  viewingVoiceRoom: boolean
  micMode: MicMode
  isBlurEnabled: boolean
  _blurHandle: BlurHandle | null
  _originalCameraTrack: MediaStreamTrack | null
  volumeOverrides: Record<string, number>
  audioOutputDeviceId: string
  voiceNetworkDropout: VoiceNetworkDropout | null
  microphoneError: 'permission' | 'device' | null
  isMicrophonePending: boolean
  playbackBlocked: boolean
  audioOutputError: boolean

  setConnecting: (serverId: string | null, channelId: string, channelName: string, dmCallId?: string) => void
  setConnected: (
    room: Room,
    options?: { skipMicModeBootstrap?: boolean; joinMuted?: boolean; joinDeafened?: boolean }
  ) => void
  requestMicrophone: (enabled: boolean) => Promise<void>
  setPlaybackBlocked: (blocked: boolean) => void
  setAudioOutputError: (error: boolean) => void
  disconnect: () => Promise<void>
  disconnectAfterUnexpectedClose: (info: VoiceNetworkDropout) => Promise<void>
  clearVoiceNetworkDropout: () => void
  applyInitialVoiceState: (opts: { joinMuted: boolean; joinDeafened: boolean }) => void
  toggleMute: () => void
  toggleDeafen: () => void
  startCamera: (quality: CameraQuality, blur: boolean) => Promise<void>
  stopCamera: () => Promise<void>
  applyCameraSettings: (quality: CameraQuality, blur: boolean) => void
  setScreenSharing: (v: boolean) => void
  setReconnecting: (v: boolean) => void
  setViewingVoiceRoom: (v: boolean) => void
  setMicMode: (mode: MicMode) => void
  setVolumeOverride: (key: string, volume: number) => void
  fetchVolumeOverrides: () => void
  setAudioOutputDeviceId: (deviceId: string) => void
}

type StoreGet = () => VoiceConnectionState
type StoreSet = (
  partial: Partial<VoiceConnectionState> | ((s: VoiceConnectionState) => Partial<VoiceConnectionState>)
) => void

function showVoiceError(message: string) {
  window.dispatchEvent(new CustomEvent('voice:error', { detail: { message } }))
}

async function captureCamera(preset: { width: number; height: number; fps: number }): Promise<MediaStreamTrack> {
  const savedDevice = getSavedCamera()
  const constraints: MediaTrackConstraints = {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps }
  }
  if (savedDevice) {
    constraints.deviceId = { exact: savedDevice }
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints
  })
  return stream.getVideoTracks()[0]
}

async function applyBlur(get: StoreGet, set: StoreSet) {
  const { room } = get()
  if (!room) return

  const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
  const mediaTrack = camPub?.track?.mediaStreamTrack
  if (!mediaTrack) return

  try {
    const { createBlurredStream } = await import('@/lib/backgroundBlur')
    const handle = await createBlurredStream(mediaTrack)
    const blurredTrack = handle.stream.getVideoTracks()[0]
    if (blurredTrack && camPub.track) {
      await camPub.track.replaceTrack(blurredTrack)
    }
    set({ _blurHandle: handle, _originalCameraTrack: mediaTrack })
  } catch (err) {
    console.warn('Background blur unavailable:', err)
    const { _blurHandle: bh, _originalCameraTrack: ot } = get()
    bh?.stop()
    ot?.stop()
    if (camPub.track) {
      camPub.track.mediaStreamTrack?.stop()
      await room.localParticipant.unpublishTrack(camPub.track).catch(() => {})
    }
    set({
      isCameraOn: false,
      isBlurEnabled: false,
      _blurHandle: null,
      _originalCameraTrack: null
    })
    emitVoiceState({ camera: false })
    showVoiceError('Background blur failed to load. Camera was stopped to protect your privacy.')
  }
}

let _saveTimer: number | undefined
let _wasMutedBeforeDeafen = false
let _micModePoll: ReturnType<typeof setInterval> | undefined
let pendingDisconnect: Promise<void> | undefined
let micRequest = 0

function disconnectRoom(room: Room | null, micCleanup: void | Promise<void>): Promise<void> {
  const previous = pendingDisconnect
  const teardown = (async () => {
    const errors: Error[] = []
    const results = await Promise.allSettled([
      micCleanup,
      (async () => {
        if (room) await stopRnnoiseMicrophone(room)
      })()
    ])
    for (const result of results) {
      if (result.status === 'rejected')
        errors.push(new Error('Failed to stop microphone processing', { cause: result.reason }))
    }
    if (room) {
      try {
        await room.disconnect()
      } catch (cause) {
        errors.push(new Error('Failed to disconnect the voice room', { cause }))
      }
    }
    if (previous) {
      try {
        await previous
      } catch (cause) {
        errors.push(new Error('An earlier voice teardown failed', { cause }))
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Voice teardown failed')
  })()
  pendingDisconnect = teardown
  // Existing UI/socket callers intentionally do not await disconnect. Handle
  // their rejection here without replacing the rejecting promise awaited by logout.
  void teardown.then(
    () => {
      if (pendingDisconnect === teardown) pendingDisconnect = undefined
    },
    (error: unknown) => {
      if (pendingDisconnect === teardown) pendingDisconnect = undefined
      console.error('Failed to disconnect voice:', error)
    }
  )
  return teardown
}

export const useVoiceConnectionStore = create<VoiceConnectionState>((set, get) => ({
  currentServerId: null,
  currentDmCallId: null,
  currentChannelId: null,
  currentChannelName: null,
  room: null,
  isMuted: false,
  isDeafened: false,
  isCameraOn: false,
  isScreenSharing: false,
  isConnecting: false,
  isReconnecting: false,
  connectedAt: null,
  viewingVoiceRoom: false,
  micMode: normalizedMicMode(),
  isBlurEnabled: false,
  _blurHandle: null,
  _originalCameraTrack: null,
  volumeOverrides: {},
  audioOutputDeviceId: '',
  voiceNetworkDropout: null,
  microphoneError: null,
  isMicrophonePending: false,
  playbackBlocked: false,
  audioOutputError: false,

  setConnecting: (serverId, channelId, channelName, dmCallId) =>
    set({
      currentServerId: serverId,
      currentDmCallId: dmCallId ?? null,
      currentChannelId: channelId,
      currentChannelName: channelName,
      isConnecting: true,
      viewingVoiceRoom: true,
      voiceNetworkDropout: null
    }),

  setConnected: (room, options) => {
    clearInterval(_micModePoll)
    _micModePoll = undefined
    const isDeafened = options?.joinDeafened ?? false
    const isMuted = (options?.joinMuted ?? false) || isDeafened
    _wasMutedBeforeDeafen = options?.joinMuted ?? false
    set({
      room,
      isConnecting: false,
      connectedAt: Date.now(),
      isMuted,
      isDeafened,
      microphoneError: null,
      isMicrophonePending: false,
      playbackBlocked: false,
      audioOutputError: false
    })
    emitVoiceState({ muted: isMuted, deafened: isDeafened })
    const mode = get().micMode
    if (mode !== 'always' && !options?.skipMicModeBootstrap) {
      let attempts = 0
      _micModePoll = setInterval(() => {
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (pub?.track || ++attempts > 20) {
          clearInterval(_micModePoll)
          _micModePoll = undefined
          if (pub?.track) startMicMode(mode)
        }
      }, 100)
    }
    get().fetchVolumeOverrides()
  },

  requestMicrophone: async (enabled) => {
    const { room, isDeafened } = get()
    if (!room || (enabled && isDeafened)) return
    const request = ++micRequest
    const isCurrent = () => get().room === room && request === micRequest
    set({ isMuted: !enabled, isMicrophonePending: enabled, microphoneError: null })
    if (!enabled) {
      stopMicMode(true)
      const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      if (track) track.mediaStreamTrack.enabled = false
      emitVoiceState({ muted: true })
    }
    await enqueueMicrophoneOperation(room, async () => {
      if (!isCurrent()) return
      try {
        await setLocalMicTransmissionEnabled(room, enabled, () => isCurrent() && !get().isMuted && !get().isDeafened)
        if (!isCurrent()) return
        set({ isMicrophonePending: false })
        emitVoiceState({ muted: !enabled })
        if (enabled && get().micMode !== 'always') startMicMode(get().micMode)
      } catch (error) {
        if (!isCurrent()) return
        console.error('Microphone unavailable:', error)
        stopMicMode(true)
        set({
          isMuted: true,
          isMicrophonePending: false,
          microphoneError: error instanceof DOMException && error.name === 'NotAllowedError' ? 'permission' : 'device'
        })
        emitVoiceState({ muted: true })
      }
    })
  },

  setPlaybackBlocked: (playbackBlocked) => set({ playbackBlocked }),
  setAudioOutputError: (audioOutputError) => set({ audioOutputError }),

  disconnect: () => {
    micRequest++
    const { room, _blurHandle, _originalCameraTrack, currentDmCallId } = get()
    if (currentDmCallId) getSocket()?.emit('dm:call:leave', { callId: currentDmCallId })
    if (_saveTimer) clearTimeout(_saveTimer)
    clearInterval(_micModePoll)
    _micModePoll = undefined
    const micCleanup = stopMicMode(true)
    _blurHandle?.stop()
    _originalCameraTrack?.stop()
    if (room) {
      room.removeAllListeners()
      room.localParticipant.getTrackPublications().forEach((pub) => {
        pub.track?.mediaStreamTrack?.stop()
      })
    }
    const teardown = room || micCleanup ? disconnectRoom(room, micCleanup) : (pendingDisconnect ?? Promise.resolve())
    set({
      currentServerId: null,
      currentDmCallId: null,
      currentChannelId: null,
      currentChannelName: null,
      room: null,
      isMuted: false,
      isDeafened: false,
      isCameraOn: false,
      isScreenSharing: false,
      isConnecting: false,
      isReconnecting: false,
      connectedAt: null,
      viewingVoiceRoom: false,
      isBlurEnabled: false,
      _blurHandle: null,
      _originalCameraTrack: null,
      volumeOverrides: {},
      voiceNetworkDropout: null,
      microphoneError: null,
      isMicrophonePending: false,
      playbackBlocked: false,
      audioOutputError: false
    })
    return teardown
  },

  disconnectAfterUnexpectedClose: (info) => {
    const teardown = get().disconnect()
    set({
      viewingVoiceRoom: true,
      voiceNetworkDropout: info
    })
    return teardown
  },

  clearVoiceNetworkDropout: () => set({ voiceNetworkDropout: null }),

  applyInitialVoiceState: ({ joinMuted, joinDeafened }) => {
    const { room } = get()
    if (!room || (!joinMuted && !joinDeafened)) return
    _wasMutedBeforeDeafen = joinMuted
    if (joinDeafened) {
      set({ isDeafened: true })
      emitVoiceState({ deafened: true })
    }
    void get().requestMicrophone(false)
  },

  toggleMute: () => {
    void get().requestMicrophone(get().isMuted)
  },

  toggleDeafen: () => {
    const { room, isDeafened, isMuted } = get()
    const next = !isDeafened
    set({ isDeafened: next })
    emitVoiceState({ deafened: next })
    if (room) {
      if (next && !isMuted) {
        _wasMutedBeforeDeafen = false
        void get().requestMicrophone(false)
      } else if (next && isMuted) {
        _wasMutedBeforeDeafen = true
      } else if (!next && isMuted && !_wasMutedBeforeDeafen) {
        void get().requestMicrophone(true)
      }
    }
  },

  startCamera: async (quality: CameraQuality, blur: boolean) => {
    const { room } = get()
    if (!room) return

    const preset = CAMERA_PRESETS[quality]
    room.options.videoCaptureDefaults = {
      ...room.options.videoCaptureDefaults,
      deviceId: getSavedCamera() || 'default',
      resolution: {
        width: preset.width,
        height: preset.height,
        frameRate: preset.fps
      }
    }

    if (blur) {
      let rawTrack: MediaStreamTrack | null = null
      try {
        rawTrack = await captureCamera(preset)
        const { createBlurredStream } = await import('@/lib/backgroundBlur')
        const handle = await createBlurredStream(rawTrack)
        const blurredTrack = handle.stream.getVideoTracks()[0]
        if (!blurredTrack) {
          handle.stop()
          rawTrack.stop()
          showVoiceError('Background blur produced no video. Camera was not started.')
          return
        }
        await room.localParticipant.publishTrack(blurredTrack, {
          source: Track.Source.Camera,
          name: 'camera'
        })
        set({
          isCameraOn: true,
          isBlurEnabled: true,
          _blurHandle: handle,
          _originalCameraTrack: rawTrack
        })
        emitVoiceState({ camera: true })
      } catch {
        rawTrack?.stop()
        showVoiceError('Background blur failed to load. Camera was not started to protect your privacy.')
      }
    } else {
      try {
        await room.localParticipant.setCameraEnabled(true)
        set({ isCameraOn: true, isBlurEnabled: false })
        emitVoiceState({ camera: true })
      } catch {
        showVoiceError('Could not access camera. Check your browser permissions.')
      }
    }
  },

  stopCamera: async () => {
    const { room, _blurHandle, _originalCameraTrack } = get()
    _blurHandle?.stop()
    _originalCameraTrack?.stop()
    if (room) {
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track) {
        camPub.track.mediaStreamTrack?.stop()
        await room.localParticipant.unpublishTrack(camPub.track).catch(() => {})
      }
    }
    set({
      isCameraOn: false,
      isBlurEnabled: false,
      _blurHandle: null,
      _originalCameraTrack: null
    })
    emitVoiceState({ camera: false })
  },

  applyCameraSettings: async (quality: CameraQuality, blur: boolean) => {
    const { room, isCameraOn, isBlurEnabled, _blurHandle } = get()
    if (!room || !isCameraOn) return

    const qualityChanged = (() => {
      const preset = CAMERA_PRESETS[quality]
      const cur = room.options.videoCaptureDefaults?.resolution
      return !cur || cur.width !== preset.width || cur.height !== preset.height
    })()

    if (qualityChanged) {
      _blurHandle?.stop()
      const { _originalCameraTrack: oldRaw } = get()
      oldRaw?.stop()
      set({ _blurHandle: null, _originalCameraTrack: null })

      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
      if (camPub?.track) {
        camPub.track.mediaStreamTrack?.stop()
        await room.localParticipant.unpublishTrack(camPub.track).catch(() => {})
      }

      const preset = CAMERA_PRESETS[quality]
      room.options.videoCaptureDefaults = {
        ...room.options.videoCaptureDefaults,
        resolution: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.fps
        }
      }

      if (blur) {
        let rawTrack: MediaStreamTrack | null = null
        try {
          rawTrack = await captureCamera(preset)
          const { createBlurredStream } = await import('@/lib/backgroundBlur')
          const handle = await createBlurredStream(rawTrack)
          const blurredTrack = handle.stream.getVideoTracks()[0]
          if (!blurredTrack) {
            handle.stop()
            rawTrack?.stop()
            set({ isCameraOn: false, isBlurEnabled: false })
            emitVoiceState({ camera: false })
            showVoiceError('Background blur produced no video. Camera was stopped.')
            return
          }
          await room.localParticipant.publishTrack(blurredTrack, {
            source: Track.Source.Camera,
            name: 'camera'
          })
          set({
            isBlurEnabled: true,
            _blurHandle: handle,
            _originalCameraTrack: rawTrack
          })
        } catch {
          rawTrack?.stop()
          set({ isCameraOn: false, isBlurEnabled: false })
          emitVoiceState({ camera: false })
          showVoiceError('Background blur failed to load. Camera was stopped to protect your privacy.')
        }
      } else {
        await room.localParticipant.setCameraEnabled(true).catch(() => {})
        set({ isBlurEnabled: false })
      }
    } else if (blur !== isBlurEnabled) {
      if (blur) {
        set({ isBlurEnabled: true })
        await applyBlur(get, set)
      } else {
        _blurHandle?.stop()
        const { _originalCameraTrack } = get()
        if (_originalCameraTrack) {
          const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera)
          if (camPub?.track) {
            await camPub.track.replaceTrack(_originalCameraTrack)
          }
        }
        set({
          isBlurEnabled: false,
          _blurHandle: null,
          _originalCameraTrack: null
        })
      }
    }
  },

  setScreenSharing: (v) => {
    set({ isScreenSharing: v })
    emitVoiceState({ screenShare: v })
  },

  setReconnecting: (v) => set({ isReconnecting: v }),

  setViewingVoiceRoom: (v) => set({ viewingVoiceRoom: v }),

  setMicMode: (mode) => {
    const { room } = get()
    set({ micMode: mode })
    const stopped = stopMicMode(true)
    void Promise.resolve(stopped)
      .then(async () => {
        const current = get()
        if (room && current.room === room && !current.isMuted && !current.isDeafened)
          await current.requestMicrophone(true)
      })
      .catch((error: unknown) => console.error('Failed to change microphone mode:', error))
  },

  fetchVolumeOverrides: () => {
    api
      .getVoiceVolumes()
      .then((map) => {
        const existing = get().volumeOverrides
        const localOnly: Record<string, number> = {}
        for (const [k, v] of Object.entries(existing)) {
          if (k.includes(':')) localOnly[k] = v
        }
        set({ volumeOverrides: { ...map, ...localOnly } })
      })
      .catch(() => {})
  },

  setVolumeOverride: (key, volume) => {
    set((s) => ({
      volumeOverrides: { ...s.volumeOverrides, [key]: volume }
    }))
    if (_saveTimer) clearTimeout(_saveTimer)
    _saveTimer = window.setTimeout(() => {
      const overrides = get().volumeOverrides
      for (const [k, v] of Object.entries(overrides)) {
        if (k.includes(':')) continue
        api.setVoiceVolume(k, v).catch(() => {})
      }
    }, 1000)
  },

  setAudioOutputDeviceId: (deviceId) => set({ audioOutputDeviceId: deviceId })
}))

setRoomGetter(() => useVoiceConnectionStore.getState().room)
