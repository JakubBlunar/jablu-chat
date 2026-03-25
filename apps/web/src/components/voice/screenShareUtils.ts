import { electronAPI, isElectron } from '@/lib/electron'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import type { ScreenShareSettings } from './ScreenShareDialog'

export type ScreenShareOptions = {
  resolution: '720p' | '1080p' | 'native'
  fps: 5 | 15 | 20 | 30
}

const RESOLUTION_MAP = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  native: { width: 0, height: 0 }
}

const BITRATE_MAP: Record<string, Record<number, number>> = {
  '720p': { 5: 800_000, 15: 1_500_000, 20: 2_000_000, 30: 3_000_000 },
  '1080p': { 5: 1_500_000, 15: 2_500_000, 20: 3_500_000, 30: 5_000_000 },
  native: { 5: 2_000_000, 15: 3_000_000, 20: 4_000_000, 30: 6_000_000 }
}

export async function startScreenShareWithSettings(settings: ScreenShareSettings) {
  if (isElectron) {
    startScreenShareElectron(settings)
  } else {
    startScreenShareWeb(settings)
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

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: settings.fps } },
      audio: settings.audio
    })

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    const videoSettings = videoTrack.getSettings()
    const height = videoSettings.height ?? 1080
    const fps = videoSettings.frameRate ?? 30
    let maxBitrate = 3_000_000
    if (height <= 720) maxBitrate = fps <= 15 ? 1_500_000 : 3_000_000
    else maxBitrate = fps <= 15 ? 2_500_000 : 5_000_000

    const videoPub = await room.localParticipant.publishTrack(videoTrack, {
      name: 'screen',
      source: 'screen_share' as unknown as undefined,
      simulcast: false,
      videoEncoding: {
        maxBitrate,
        maxFramerate: fps
      },
      degradationPreference: 'maintain-resolution'
    })

    const audioTrack = stream.getAudioTracks()[0]
    let audioPub: { track?: { stop?: () => void } | null } | null = null
    if (audioTrack) {
      audioPub = await room.localParticipant.publishTrack(audioTrack, {
        name: 'screen-audio',
        source: 'screen_share_audio' as unknown as undefined
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
  const bitrate = BITRATE_MAP[options.resolution]?.[options.fps] ?? 3_000_000

  const mandatory: Record<string, unknown> = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
    maxFrameRate: options.fps
  }

  if (options.resolution !== 'native') {
    mandatory.maxWidth = res.width
    mandatory.maxHeight = res.height
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: options.audio ? { mandatory: { chromeMediaSource: 'desktop' } } as unknown as boolean : false,
      video: {
        // @ts-expect-error Electron's desktopCapturer requires these mandatory constraints
        mandatory
      }
    })

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    const videoPub = await room.localParticipant.publishTrack(videoTrack, {
      name: 'screen',
      source: 'screen_share' as unknown as undefined,
      simulcast: false,
      videoEncoding: {
        maxBitrate: bitrate,
        maxFramerate: options.fps
      },
      degradationPreference: 'maintain-resolution'
    })

    const audioTrack = stream.getAudioTracks()[0]
    let audioPub: { track?: { stop?: () => void } | null } | null = null
    if (audioTrack) {
      audioPub = await room.localParticipant.publishTrack(audioTrack, {
        name: 'screen-audio',
        source: 'screen_share_audio' as unknown as undefined
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
    console.error('Failed to start screen share:', err)
  }
}
