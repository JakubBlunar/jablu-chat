import type { Track } from 'livekit-client'

// Wire identifiers are usable by idle stores without loading the media SDK.
export const voiceTrackSources = {
  Microphone: 'microphone' as Track.Source,
  Camera: 'camera' as Track.Source,
  ScreenShare: 'screen_share' as Track.Source,
  ScreenShareAudio: 'screen_share_audio' as Track.Source
}
