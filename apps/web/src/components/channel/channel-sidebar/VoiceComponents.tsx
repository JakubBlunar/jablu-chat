import React, { useEffect, useState } from 'react'
import { RoomEvent, type Participant } from 'livekit-client'
import { UserAvatar } from '@/components/UserAvatar'
import { type VoiceParticipant } from '@/stores/voice.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import type { Member } from '@/stores/member.store'

export function VoiceStatusIcons({ participant }: { participant: VoiceParticipant }) {
  const icons: React.ReactNode[] = []

  if (participant.muted) {
    icons.push(
      <svg key="muted" className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-label="Muted">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>
    )
  }

  if (participant.deafened) {
    icons.push(
      <svg
        key="deafened"
        className="h-3.5 w-3.5 text-red-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Deafened"
      >
        <path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.59.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .45.3.87.74 1C17.01 6.54 19 9.06 19 12zm-7-8l-1.88 1.88L12 7.76zm4.5 8A4.5 4.5 0 0014 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z" />
      </svg>
    )
  }

  if (participant.camera) {
    icons.push(
      <svg
        key="camera"
        className="h-3.5 w-3.5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Camera on"
      >
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    )
  }

  if (participant.screenShare) {
    icons.push(
      <svg
        key="screen"
        className="h-3.5 w-3.5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Sharing screen"
      >
        <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
      </svg>
    )
  }

  if (icons.length === 0) return null

  return <span className="flex shrink-0 items-center gap-0.5">{icons}</span>
}

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
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers)
    }
  }, [room])

  return speaking
}

export function VoiceParticipantRow({
  participant,
  member,
  isSpeaking,
  onClick
}: {
  participant: VoiceParticipant
  member?: Member
  isSpeaking: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      className="group/vp flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-white/[.07]"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(e as unknown as React.MouseEvent)
        }
      }}
    >
      <div className="relative shrink-0">
        <UserAvatar
          username={participant.username}
          avatarUrl={member?.user.avatarUrl}
          size="sm"
        />
        {isSpeaking && (
          <div className="absolute -inset-[3px] rounded-full ring-2 ring-emerald-500/80" />
        )}
      </div>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] font-medium transition-colors ${
          isSpeaking ? 'text-emerald-400' : 'text-gray-300 group-hover/vp:text-gray-100'
        }`}
      >
        {member?.user.displayName || participant.username}
      </span>
      <VoiceStatusIcons participant={participant} />
    </li>
  )
}
