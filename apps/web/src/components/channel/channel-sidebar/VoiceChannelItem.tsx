import React from 'react'
import type { Channel } from '@chat/shared'
import type { Member } from '@/stores/member.store'
import { type VoiceParticipant } from '@/stores/voice.store'
import { SpeakerIcon, GearSmallIcon } from './sidebarIcons'
import { VoiceParticipantRow } from './VoiceComponents'

export function VoiceChannelItem({
  ch,
  voiceParticipants,
  currentVoiceChannelId,
  viewingVoiceRoom,
  isAdminOrOwner,
  isMobile,
  speakingUsers,
  members,
  longPressFired,
  handleVoiceChannelClick,
  handleChannelTouchStart,
  handleChannelTouchEnd,
  handleChannelTouchMove,
  handleChannelContextMenu,
  handleVoiceParticipantClick,
  setEditingChannel
}: {
  ch: Channel
  voiceParticipants: Record<string, VoiceParticipant[]>
  currentVoiceChannelId: string | null
  viewingVoiceRoom: boolean
  isAdminOrOwner: boolean
  isMobile: boolean
  speakingUsers: Set<string>
  members: Member[]
  longPressFired: React.MutableRefObject<boolean>
  handleVoiceChannelClick: (ch: Channel) => void
  handleChannelTouchStart: (ch: Channel) => void
  handleChannelTouchEnd: () => void
  handleChannelTouchMove: () => void
  handleChannelContextMenu: (e: React.MouseEvent) => void
  handleVoiceParticipantClick: (p: VoiceParticipant, e: React.MouseEvent) => void
  setEditingChannel: (ch: Channel) => void
}) {
  const participants = voiceParticipants[ch.id] ?? []
  const inThisChannel = currentVoiceChannelId === ch.id && viewingVoiceRoom
  return (
    <li>
      <div className="group/ch rounded-md px-2 py-1.5 text-[15px] text-gray-300">
        <div className="flex w-full items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              if (longPressFired.current) {
                e.preventDefault()
                e.stopPropagation()
                longPressFired.current = false
                return
              }
              handleVoiceChannelClick(ch)
            }}
            onTouchStart={() => handleChannelTouchStart(ch)}
            onTouchEnd={handleChannelTouchEnd}
            onTouchMove={handleChannelTouchMove}
            onContextMenu={handleChannelContextMenu}
            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left ${inThisChannel ? 'text-white' : ''}`}
          >
            <SpeakerIcon />
            <span className="min-w-0 flex-1 truncate">{ch.name}</span>
            {participants.length > 0 && (
              <span className="shrink-0 text-xs text-gray-400">{participants.length}</span>
            )}
          </button>
          {isAdminOrOwner && !isMobile && (
            <button
              type="button"
              aria-label="Edit channel"
              className="shrink-0 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-white group-hover/ch:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                setEditingChannel(ch)
              }}
            >
              <GearSmallIcon />
            </button>
          )}
        </div>
        {participants.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {participants.map((p) => {
              const member = members.find((m) => m.userId === p.userId)
              return (
                <VoiceParticipantRow
                  key={p.userId}
                  participant={p}
                  member={member}
                  isSpeaking={speakingUsers.has(p.userId)}
                  onClick={(e) => handleVoiceParticipantClick(p, e)}
                />
              )
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-500">No one connected</p>
        )}
      </div>
    </li>
  )
}
