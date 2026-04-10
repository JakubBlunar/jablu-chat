import { create } from 'zustand'
import { Track, type Room } from 'livekit-client'
import { isElectron } from '@/lib/electron'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { type MicMode, getMicMode, startMicMode, stopMicMode, setRoomGetter } from '@/lib/micMode'
import { stopRnnoiseMicrophone } from '@/lib/rnnoiseMicrophone'
import { setLocalMicTransmissionEnabled } from '@/lib/voiceLocalMic'
import { type CameraQuality, CAMERA_PRESETS, getSavedCamera } from '@/lib/deviceSettings'
import type { BlurHandle } from '@/lib/backgroundBlur'

function normalizedMicMode(): MicMode {
  const saved = getMicMode()
  if (saved === 'push-to-talk' && !isElectron) return 'activity'
  return saved
}

function emitVoiceState(state: { muted?: boolean; deafened?: boolean; camera?: boolean; screenShare?: boolean }) {
  getSocket()?.emit('voice:state', state)
}

export type VoiceNetworkDropout = {
  serverId: string
  channelId: string
  channelName: string
}

export type VoiceConnectionState = {
  currentServerId: string | null
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

  setConnecting: (serverId: string, channelId: string, channelName: string) => void
  setConnected: (room: Room, options?: { skipMicModeBootstrap?: boolean }) => void
  disconnect: () => void
  disconnectAfterUnexpectedClose: (info: VoiceNetworkDropout) => void
  clearVoiceNetworkDropout: () => void
  applyInitialVoiceState: (opts: { joinMuted: boolean; joinDeafened: boolean }) => void
  toggleMute: () => void
  toggleDeafen: () => void
  startCamera: (quality: CameraQuality, blur: boolean) => void
  stopCamera: () => void
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

export const useVoiceConnectionStore = create<VoiceConnectionState>((set, get) => ({
  currentServerId: null,
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

  setConnecting: (serverId, channelId, channelName) =>
    set({
      currentServerId: serverId,
      currentChannelId: channelId,
      currentChannelName: channelName,
      isConnecting: true,
      viewingVoiceRoom: true,
      voiceNetworkDropout: null
    }),

  setConnected: (room, options) => {
    set({ room, isConnecting: false, connectedAt: Date.now() })
    const mode = get().micMode
    if (mode !== 'always' && !options?.skipMicModeBootstrap) {
      let attempts = 0
      const poll = setInterval(() => {
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
        if (pub?.track || ++attempts > 20) {
          clearInterval(poll)
          if (pub?.track) startMicMode(mode)
        }
      }, 100)
    }
    get().fetchVolumeOverrides()
  },

  disconnect: () => {
    const { room, _blurHandle, _originalCameraTrack } = get()
    if (_saveTimer) clearTimeout(_saveTimer)
    stopMicMode()
    _blurHandle?.stop()
    _originalCameraTrack?.stop()
    if (room) {
      void stopRnnoiseMicrophone(room)
      room.removeAllListeners()
      room.localParticipant.getTrackPublications().forEach((pub) => {
        pub.track?.mediaStreamTrack?.stop()
      })
      room.disconnect().catch(() => {})
    }
    set({
      currentServerId: null,
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
      voiceNetworkDropout: null
    })
  },

  disconnectAfterUnexpectedClose: (info) => {
    const { room, _blurHandle, _originalCameraTrack } = get()
    if (_saveTimer) clearTimeout(_saveTimer)
    stopMicMode()
    _blurHandle?.stop()
    _originalCameraTrack?.stop()
    if (room) {
      void stopRnnoiseMicrophone(room)
      room.removeAllListeners()
      room.localParticipant.getTrackPublications().forEach((pub) => {
        pub.track?.mediaStreamTrack?.stop()
      })
      room.disconnect().catch(() => {})
    }
    set({
      currentServerId: null,
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
      viewingVoiceRoom: true,
      isBlurEnabled: false,
      _blurHandle: null,
      _originalCameraTrack: null,
      volumeOverrides: {},
      voiceNetworkDropout: info
    })
  },

  clearVoiceNetworkDropout: () => set({ voiceNetworkDropout: null }),

  applyInitialVoiceState: ({ joinMuted, joinDeafened }) => {
    const { room } = get()
    if (!room || (!joinMuted && !joinDeafened)) return

    if (joinMuted) {
      stopMicMode(true)
      void setLocalMicTransmissionEnabled(room, false)
      set({ isMuted: true })
      emitVoiceState({ muted: true })
    }

    if (joinDeafened) {
      set({ isDeafened: true })
      emitVoiceState({ deafened: true })
      if (!joinMuted) {
        _wasMutedBeforeDeafen = false
        stopMicMode(true)
        void setLocalMicTransmissionEnabled(room, false)
        set({ isMuted: true })
        emitVoiceState({ muted: true })
      } else {
        _wasMutedBeforeDeafen = true
      }
    }
  },

  toggleMute: () => {
    const { room, isMuted, micMode } = get()
    const next = !isMuted
    if (next) {
      stopMicMode(true)
    }
    if (room) {
      void setLocalMicTransmissionEnabled(room, !next)
    }
    if (!next && micMode !== 'always') {
      setTimeout(() => startMicMode(micMode), 300)
    }
    set({ isMuted: next })
    emitVoiceState({ muted: next })
  },

  toggleDeafen: () => {
    const { room, isDeafened, isMuted, micMode } = get()
    const next = !isDeafened
    set({ isDeafened: next })
    emitVoiceState({ deafened: next })
    if (room) {
      if (next && !isMuted) {
        _wasMutedBeforeDeafen = false
        stopMicMode(true)
        void setLocalMicTransmissionEnabled(room, false)
        set({ isMuted: true })
        emitVoiceState({ muted: true })
      } else if (next && isMuted) {
        _wasMutedBeforeDeafen = true
      } else if (!next && isMuted && !_wasMutedBeforeDeafen) {
        void setLocalMicTransmissionEnabled(room, true)
        if (micMode !== 'always') {
          setTimeout(() => startMicMode(micMode), 300)
        }
        set({ isMuted: false })
        emitVoiceState({ muted: false })
      }
    }
  },

  startCamera: async (quality: CameraQuality, blur: boolean) => {
    const { room } = get()
    if (!room) return

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
    const { isMuted } = get()
    set({ micMode: mode })
    stopMicMode()
    if (!isMuted && mode !== 'always') {
      startMicMode(mode)
    }
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
