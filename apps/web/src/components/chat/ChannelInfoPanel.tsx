import type { Message, UserStatus } from '@chat/shared'
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { NotifBellMenu } from '@/components/channel/NotifBellMenu'
import { ProfileCard, type ProfileCardUser } from '@/components/ProfileCard'
import { BookmarkIcon, SearchIcon, SettingsCogIcon } from '@/components/chat/chatIcons'
import { MemberListPanel } from '@/components/member/MemberListPanel'
import type { Member } from '@/stores/member.store'
import { getTopRole, getRoleColor, useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { PinnedMessagesList } from '@/components/chat/PinnedMessagesList'

const InviteModal = React.lazy(() =>
  import('@/components/server/InviteModal').then((m) => ({ default: m.InviteModal }))
)

type TabId = 'members' | 'pins'

export function ChannelInfoPanel({
  open,
  onClose,
  channelName,
  channelId,
  serverId,
  serverName,
  vanityCode,
  pinnedCount,
  isAdmin,
  onSearch,
  onSaved,
  onSettings,
  loadPinned,
  pinnedMessages,
  pinnedLoading,
  canUnpin,
  onJumpToMessage
}: {
  open: boolean
  onClose: () => void
  channelName: string
  channelId: string
  serverId: string
  serverName: string
  vanityCode?: string | null
  pinnedCount: number
  isAdmin: boolean
  onSearch: () => void
  onSaved: () => void
  onSettings: () => void
  loadPinned: () => Promise<void>
  pinnedMessages: Message[]
  pinnedLoading: boolean
  canUnpin: boolean
  onJumpToMessage: (messageId: string) => void
}) {
  const { t } = useTranslation('chat')
  const [tab, setTab] = useState<TabId>('members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [cardUser, setCardUser] = useState<ProfileCardUser | null>(null)
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)

  const members = useMemberStore((s) => s.members)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const membersLoading = useMemberStore((s) => s.isLoading)
  const ownerId = useServerStore((s) => s.servers.find((sv) => sv.id === serverId)?.ownerId)

  const listMembers = useMemo(() => members.filter((m) => m.serverId === serverId), [members, serverId])

  useEffect(() => {
    if (!open) {
      setTab('members')
      setInviteOpen(false)
      setCardUser(null)
    }
  }, [open])

  useEffect(() => {
    if (open && tab === 'pins') {
      void loadPinned()
    }
  }, [open, tab, loadPinned])

  const closeCard = useCallback(() => setCardUser(null), [])

  const handleMemberClick = useCallback((member: Member, presence: UserStatus, rect: DOMRect) => {
    const topRole = getTopRole(member)
    setCardUser({
      id: member.userId,
      username: member.user.username,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      bio: member.user.bio ?? null,
      isBot: member.user.isBot,
      status: presence,
      customStatus: member.user.customStatus ?? null,
      joinedAt: member.joinedAt,
      roleName: topRole && !topRole.isDefault ? topRole.name : null,
      roleColor: getRoleColor(member)
    })
    setCardRect(rect)
  }, [])

  const handleJump = useCallback(
    (messageId: string) => {
      onClose()
      onJumpToMessage(messageId)
    },
    [onClose, onJumpToMessage]
  )

  return (
    <>
      <BottomSheet open={open} onClose={onClose} zIndex={110} maxHeightDvh={88} bodyScrollable={false}>
        <div className="flex h-full min-h-0 flex-col px-1">
          <div className="shrink-0 border-b border-black/20 px-3 pb-2 pt-0">
            <h2 className="truncate text-lg font-semibold text-white">
              <span className="text-gray-400"># </span>
              {channelName}
            </h2>
          </div>

          <div className="shrink-0 border-b border-black/20 px-2 py-3">
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-3">
              <ActionTile
                label={t('channelInfoActionSearch')}
                onClick={() => {
                  onClose()
                  onSearch()
                }}
              >
                <SearchIcon className="h-6 w-6" strokeWidth={1.75} />
              </ActionTile>
              <div className="flex w-[4.5rem] flex-col items-center gap-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08]">
                  <NotifBellMenu channelId={channelId} serverId={serverId} />
                </div>
                <span className="text-center text-[11px] text-gray-400">{t('channelInfoActionNotifications')}</span>
              </div>
              <ActionTile
                label={t('channelInfoActionSaved')}
                onClick={() => {
                  onClose()
                  onSaved()
                }}
              >
                <BookmarkIcon className="h-6 w-6" />
              </ActionTile>
              {isAdmin && (
                <ActionTile
                  label={t('channelInfoActionSettings')}
                  onClick={() => {
                    onClose()
                    onSettings()
                  }}
                >
                  <SettingsCogIcon className="h-6 w-6" />
                </ActionTile>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-1 border-b border-black/20 px-2">
            <button
              type="button"
              onClick={() => setTab('members')}
              className={`relative flex-1 py-2.5 text-center text-sm font-semibold transition ${
                tab === 'members' ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t('channelInfoTabMembers')}
              {tab === 'members' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('pins')}
              className={`relative flex-1 py-2.5 text-center text-sm font-semibold transition ${
                tab === 'pins' ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                {t('channelInfoTabPins')}
                {pinnedCount > 0 && (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-text">
                    {pinnedCount > 99 ? '99+' : pinnedCount}
                  </span>
                )}
              </span>
              {tab === 'pins' && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <SimpleBar className="h-full max-h-full" style={{ maxHeight: '100%' }}>
              {tab === 'members' ? (
                <div className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => setInviteOpen(true)}
                    className="mb-3 flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-3 text-left transition hover:bg-white/[0.08]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-gray-300">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1 font-medium text-white">{t('channelInfoInviteMembers')}</span>
                    <svg className="h-4 w-4 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                  <MemberListPanel
                    members={listMembers}
                    onlineIds={onlineIds}
                    isLoading={membersLoading}
                    ownerId={ownerId}
                    onMemberClick={handleMemberClick}
                  />
                </div>
              ) : (
                <PinnedMessagesList
                  messages={pinnedMessages}
                  loading={pinnedLoading}
                  canUnpin={canUnpin}
                  channelId={channelId}
                  onJump={handleJump}
                  emptyLabel={t('pinnedEmptyChannel')}
                  jumpLabel={t('jumpToMessage')}
                  className="py-1"
                />
              )}
            </SimpleBar>
          </div>
        </div>
      </BottomSheet>

      {inviteOpen && (
        <Suspense fallback={null}>
          <InviteModal
            serverId={serverId}
            serverName={serverName}
            vanityCode={vanityCode ?? undefined}
            onClose={() => setInviteOpen(false)}
            overlayZIndex="z-[120]"
          />
        </Suspense>
      )}
      {cardUser && <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />}
    </>
  )
}

function ActionTile({
  label,
  onClick,
  children
}: {
  label: string
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-[4.5rem] flex-col items-center gap-1 rounded-lg py-1 transition hover:bg-white/[0.06]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.08] text-gray-200">
        {children}
      </span>
      <span className="text-center text-[11px] text-gray-400">{label}</span>
    </button>
  )
}
