import { useEffect, useState } from 'react'
import type { RoomEvent, Participant } from 'livekit-client'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
export function useSpeakingUsers() {
  const room = useVoiceConnectionStore((s) => s.room)
  const [speaking, setSpeaking] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!room) {
      setSpeaking(new Set())
      return
    }
    const onSpeakers = (speakers: Participant[]) => {
      setSpeaking(new Set(speakers.map((s) => s.identity)))
    }
    const event = 'activeSpeakersChanged' as RoomEvent.ActiveSpeakersChanged
    room.on(event, onSpeakers)
    return () => {
      room.off(event, onSpeakers)
    }
  }, [room])

  return speaking
}
