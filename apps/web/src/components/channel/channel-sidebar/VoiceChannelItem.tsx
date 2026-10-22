import { ChannelContextMenu } from '../ChannelContextMenu'
import { useTranslation } from 'react-i18next'
import type { Channel } from '@chat/shared'
import type { Member } from '@/stores/member.store'
import { type VoiceParticipant } from '@/stores/voice.store'
import { SpeakerIcon } from './sidebarIcons'
import { VoiceParticipantRow } from './VoiceComponents'

export function VoiceChannelItem({
  ch,
  voiceParticipants,
  currentVoiceChannelId,
  viewingVoiceRoom,
  isAdminOrOwner,
  speakingUsers,
  members,
  handleVoiceChannelClick,
  handleVoiceParticipantClick,
  setEditingChannel
}: {
  ch: Channel
  voiceParticipants: Record<string, VoiceParticipant[]>
  currentVoiceChannelId: string | null
  viewingVoiceRoom: boolean
  isAdminOrOwner: boolean
  speakingUsers: Set<string>
  members: Member[]
  handleVoiceChannelClick: (ch: Channel) => void
  handleVoiceParticipantClick: (p: VoiceParticipant, e: React.MouseEvent) => void
  setEditingChannel: (ch: Channel) => void
}) {
  const { t } = useTranslation('channels')
  const participants = voiceParticipants[ch.id] ?? []
  const inThisChannel = currentVoiceChannelId === ch.id && viewingVoiceRoom
  return (
    <li>
      <div className="group/ch rounded-md px-2 py-1.5 text-[15px] text-gray-300">
        <div className="flex w-full items-center gap-2">
          <ChannelContextMenu channel={ch} canManage={isAdminOrOwner} onEdit={() => setEditingChannel(ch)}>
            <button
              type="button"
              onClick={() => {
                handleVoiceChannelClick(ch)
              }}
              className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left ${inThisChannel ? 'text-white' : ''}`}
            >
              <SpeakerIcon />
              <span className="min-w-0 flex-1 truncate">{ch.name}</span>
              {participants.length > 0 && <span className="shrink-0 text-xs text-gray-400">{participants.length}</span>}
            </button>
          </ChannelContextMenu>
        </div>
        {participants.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {participants.map((p) => {
              const member = members.find((m) => m.userId === p.userId)
              return (
                <VoiceParticipantRow
                  key={p.userId}
                  participant={p}
                  channelId={ch.id}
                  member={member}
                  isSpeaking={speakingUsers.has(p.userId)}
                  onClick={(e) => handleVoiceParticipantClick(p, e)}
                />
              )
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-500">{t('voice.noOneConnected')}</p>
        )}
      </div>
    </li>
  )
}
