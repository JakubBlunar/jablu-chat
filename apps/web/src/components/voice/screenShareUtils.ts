import { electronAPI, isElectron } from '@/lib/electron'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import type { ScreenShareSettings } from './ScreenShareDialog'
import { resolveScreenShareMaxBitrate } from './screenShareBitrate'

export type ScreenShareOptions = {
  resolution: '720p' | '1080p' | 'native'
  fps: 5 | 15 | 20 | 30
}

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  native: { width: 0, height: 0 }
}

export async function startScreenShareWithSettings(settings: ScreenShareSettings) {
  if (isElectron) {
    await startScreenShareElectron(settings)
  } else {
    await startScreenShareWeb(settings)
  }
}

/** @deprecated Use startScreenShareWithSettings */
export async function startScreenShare() {
  startScreenShareWithSettings({ resolution: '1080p', fps: 30, audio: false })
}

async function startScreenShareElectron(settings: ScreenShareSettings) {
  const store = useVoiceConnectionStore.getState()
  const room = store.room
  if (!room || !electronAPI) return

  try {
    const sources = await electronAPI.getSources()
    if (sources.length === 0) return

    window.dispatchEvent(
      new CustomEvent('voice:pick-screen', {
        detail: { sources, audio: settings.audio, resolution: settings.resolution, fps: settings.fps }
      })
    )
  } catch (err) {
    console.error('Failed to get screen sources:', err)
  }
}

async function startScreenShareWeb(settings: ScreenShareSettings) {
  const store = useVoiceConnectionStore.getState()
  const room = store.room
  if (!room) return

  let stream: MediaStream | null = null
  try {
    const videoConstraints: MediaTrackConstraints = {
      frameRate: { ideal: settings.fps }
    }
    if (settings.resolution !== 'native') {
      const res = RESOLUTION_MAP[settings.resolution]
      videoConstraints.width = { max: res.width }
      videoConstraints.height = { max: res.height }
    }

    stream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: settings.audio
    })

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    videoTrack.contentHint = 'detail'

    const actualSettings = videoTrack.getSettings()
    const fps =
      actualSettings.frameRate && actualSettings.frameRate > 0
        ? actualSettings.frameRate
        : settings.fps
    const bitrate = resolveScreenShareMaxBitrate(settings.resolution, settings.fps, actualSettings)

    const videoPub = await room.localParticipant.publishTrack(videoTrack, {
      name: 'screen',
      source: 'screen_share' as unknown as undefined,
      simulcast: false,
      videoEncoding: {
        maxBitrate: bitrate,
        maxFramerate: fps
      },
      degradationPreference: 'maintain-resolution'
    })

    const audioTrack = stream.getAudioTracks()[0]
    let audioPub: { track?: { stop?: () => void } | null } | null = null
    if (audioTrack) {
      audioPub = await room.localParticipant.publishTrack(audioTrack, {
        name: 'screen-audio',
        source: 'screen_share_audio' as unknown as undefined,
        audioPreset: { maxBitrate: 128_000 },
        dtx: false
      })
    }

    videoTrack.onended = () => {
      if (videoPub.track) {
        room.localParticipant.unpublishTrack(videoPub.track)
      }
      if (audioPub?.track) {
        room.localParticipant.unpublishTrack(audioPub.track as Parameters<typeof room.localParticipant.unpublishTrack>[0])
        audioTrack?.stop()
      }
      useVoiceConnectionStore.getState().setScreenSharing(false)
    }

    store.setScreenSharing(true)
  } catch (err) {
    if ((err as DOMException).name === 'NotAllowedError') return
    stream?.getTracks().forEach((t) => t.stop())
    console.error('Failed to start screen share:', err)
  }
}

export async function publishScreenShare(
  sourceId: string,
  options: ScreenShareOptions & { audio?: boolean }
) {
  const store = useVoiceConnectionStore.getState()
  const room = store.room
  if (!room) return

  const res = RESOLUTION_MAP[options.resolution]

  const mandatory: Record<string, unknown> = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
    maxFrameRate: options.fps
  }

  if (options.resolution !== 'native') {
    mandatory.maxWidth = res.width
    mandatory.maxHeight = res.height
  }

  let stream: MediaStream | null = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: options.audio ? { mandatory: { chromeMediaSource: 'desktop' } } as unknown as boolean : false,
      video: {
        // @ts-expect-error Electron's desktopCapturer requires these mandatory constraints
        mandatory
      }
    })

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    videoTrack.contentHint = 'detail'

    const actualSettings = videoTrack.getSettings()
    const fps =
      actualSettings.frameRate && actualSettings.frameRate > 0
        ? actualSettings.frameRate
        : options.fps
    const bitrate = resolveScreenShareMaxBitrate(options.resolution, options.fps, actualSettings)

    const videoPub = await room.localParticipant.publishTrack(videoTrack, {
      name: 'screen',
      source: 'screen_share' as unknown as undefined,
      simulcast: false,
      videoEncoding: {
        maxBitrate: bitrate,
        maxFramerate: fps
      },
      degradationPreference: 'maintain-resolution'
    })

    const audioTrack = stream.getAudioTracks()[0]
    let audioPub: { track?: { stop?: () => void } | null } | null = null
    if (audioTrack) {
      audioPub = await room.localParticipant.publishTrack(audioTrack, {
        name: 'screen-audio',
        source: 'screen_share_audio' as unknown as undefined,
        audioPreset: { maxBitrate: 128_000 },
        dtx: false
      })
    }

    videoTrack.onended = () => {
      if (videoPub.track) {
        room.localParticipant.unpublishTrack(videoPub.track)
      }
      if (audioPub?.track) {
        room.localParticipant.unpublishTrack(audioPub.track as Parameters<typeof room.localParticipant.unpublishTrack>[0])
        audioTrack?.stop()
      }
      useVoiceConnectionStore.getState().setScreenSharing(false)
    }

    store.setScreenSharing(true)
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop())
    console.error('Failed to start screen share:', err)
  }
}
