import type { Channel } from '@chat/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { ChannelOptionsDrawer } from '@/components/channel/ChannelOptionsDrawer'
import { GroupDmModal } from '@/components/dm/GroupDmModal'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import { DmIcon, HashIcon, SpeakerIcon, VoiceStatusIcons, PlusSmallIcon } from './mobile-nav/mobileNavIcons'
import { UserFooter } from '@/components/layout/UserFooter'
import { ServerMenuSheet } from './mobile-nav/ServerMenuSheet'
const CreateChannelModal = React.lazy(() =>
  import('@/components/channel/CreateChannelModal').then((m) => ({ default: m.CreateChannelModal }))
)
const EditChannelModal = React.lazy(() =>
  import('@/components/channel/EditChannelModal').then((m) => ({ default: m.EditChannelModal }))
)
const InviteModal = React.lazy(() =>
  import('@/components/server/InviteModal').then((m) => ({ default: m.InviteModal }))
)
const ServerSettingsModal = React.lazy(() =>
  import('@/components/server/ServerSettingsModal').then((m) => ({ default: m.ServerSettingsModal }))
)
import { UserAvatar } from '@/components/UserAvatar'
import { VoicePanel } from '@/components/voice/VoicePanel'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { api, resolveMediaUrl } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useSortedChannels } from '@/hooks/useSortedChannels'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useMemberStore } from '@/stores/member.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { type Server, useServerStore } from '@/stores/server.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'
import { useShallow } from 'zustand/react/shallow'
import { CountBadge, IconButton } from '@/components/ui'
import { ForumChannelItem } from '@/components/channel/channel-sidebar/ForumChannelItem'
import { computeChannelBadge, computeServerBadge, type NotifLevel } from '@/lib/unread'

const EventsPanel = React.lazy(() =>
  import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel }))
)
const ReorderChannelsModal = React.lazy(() =>
  import('@/components/server/ReorderChannelsModal').then((m) => ({ default: m.ReorderChannelsModal }))
)
const ServerNotifModal = React.lazy(() =>
  import('@/components/server/ServerNotifModal').then((m) => ({ default: m.ServerNotifModal }))
)
const CreateCategoryModal = React.lazy(() =>
  import('@/components/channel/CreateCategoryModal').then((m) => ({ default: m.CreateCategoryModal }))
)
const RolePickerModal = React.lazy(() =>
  import('@/components/server/RolePickerModal').then((m) => ({ default: m.RolePickerModal }))
)

export function MobileNavDrawer({ onOpenSettings, onOpenQuickSwitcher }: { onOpenSettings: (tab?: string) => void; onOpenQuickSwitcher: () => void }) {
  const { t } = useTranslation('nav')
  const { open, close } = useLayoutStore(useShallow((s) => ({ open: s.navDrawerOpen, close: s.closeNavDrawer })))

  const { orchestratedGoToChannel, goToDms, goToDm } = useAppNavigate()

  const { viewMode, servers, currentServerId, removeServer } = useServerStore(
    useShallow((s) => ({ viewMode: s.viewMode, servers: s.servers, currentServerId: s.currentServerId, removeServer: s.removeServer }))
  )

  const { channels, currentChannelId, storeCategories } = useChannelStore(
    useShallow((s) => ({
      channels: s.channels,
      currentChannelId: s.currentChannelId,
      storeCategories: s.categories
    }))
  )

  const { collapsedCategoryIds, toggleCollapsedCategory } = useSettingsStore(
    useShallow((s) => ({
      collapsedCategoryIds: s.collapsedCategoryIds,
      toggleCollapsedCategory: s.toggleCollapsedCategory
    }))
  )

  const { conversations, currentConvId, fetchConversations, closeConv } = useDmStore(
    useShallow((s) => ({
      conversations: s.conversations,
      currentConvId: s.currentConversationId,
      fetchConversations: s.fetchConversations,
      closeConv: s.closeConversation
    }))
  )

  useEffect(() => {
    if (viewMode === 'dm') fetchConversations()
  }, [viewMode, fetchConversations])

  const user = useAuthStore((s) => s.user)

  const { onlineIds, members } = useMemberStore(useShallow((s) => ({ onlineIds: s.onlineUserIds, members: s.members })))

  const { dmReadStates, channelReadStates, channelToServer } = useReadStateStore(
    useShallow((s) => ({ dmReadStates: s.dms, channelReadStates: s.channels, channelToServer: s.channelToServer }))
  )

  const { notifPrefs, serverPrefs, getEffective } = useNotifPrefStore(
    useShallow((s) => ({ notifPrefs: s.prefs, serverPrefs: s.serverPrefs, getEffective: s.getEffective }))
  )

  const pendingFriendCount = useFriendStore((s) => s.pending.length)

  const { viewingVoiceRoom, currentVoiceChannelId, voiceServerId } = useVoiceConnectionStore(
    useShallow((s) => ({
      viewingVoiceRoom: s.viewingVoiceRoom,
      currentVoiceChannelId: s.currentChannelId ?? s.voiceNetworkDropout?.channelId ?? null,
      voiceServerId: s.currentServerId ?? s.voiceNetworkDropout?.serverId ?? null
    }))
  )

  const voiceParticipants = useVoiceStore((s) => s.participants)

  const handleGoToVoiceRoom = useCallback(() => {
    if (voiceServerId && currentVoiceChannelId) {
      useVoiceConnectionStore.getState().setViewingVoiceRoom(true)
      void orchestratedGoToChannel(voiceServerId, currentVoiceChannelId)
      close()
    }
  }, [voiceServerId, currentVoiceChannelId, orchestratedGoToChannel, close])

  const [serverMenuOpen, setServerMenuOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [groupDmOpen, setGroupDmOpen] = useState(false)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [serverNotifOpen, setServerNotifOpen] = useState(false)
  const [rolePickerOpen, setRolePickerOpen] = useState(false)
  const [dmFilter, setDmFilter] = useState('')
  const { has: hasPerm } = usePermissions(currentServerId)
  const isAdminOrOwner = hasPerm(Permission.MANAGE_CHANNELS)

  const [drawerChannel, setDrawerChannel] = useState<Channel | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleChannelTouchStart = useCallback(
    (ch: Channel) => {
      const hasOptions = ch.type === 'text' || isAdminOrOwner
      if (!hasOptions) return
      longPressFired.current = false
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        setDrawerChannel(ch)
      }, 500)
    },
    [isAdminOrOwner]
  )

  const handleChannelTouchEnd = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleChannelTouchMove = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleChannelContextMenu = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
  }, [])

  useEffect(() => {
    if (!open) return
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('contextmenu', block, { capture: true })
    return () => document.removeEventListener('contextmenu', block, { capture: true })
  }, [open])

  const handleDrawerOpenPinned = useCallback(() => {
    if (!drawerChannel || !currentServerId) return
    void orchestratedGoToChannel(currentServerId, drawerChannel.id)
    useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
    close()
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-pinned')), 100)
  }, [drawerChannel, currentServerId, orchestratedGoToChannel, close])

  const filteredConversations = useMemo(() => {
    if (!dmFilter.trim()) return conversations
    const q = dmFilter.toLowerCase()
    return conversations.filter((conv) => {
      const members = conv.members ?? []
      return members.some(
        (m) =>
          (m.username && m.username.toLowerCase().includes(q)) ||
          (m.displayName && m.displayName.toLowerCase().includes(q))
      )
    })
  }, [conversations, dmFilter])

  const currentServer = useMemo(() => servers.find((s) => s.id === currentServerId) ?? null, [servers, currentServerId])
  const isOwner = currentServer?.ownerId === user?.id
  const eventCount = useEventStore((s) =>
    currentServerId && s.loadedServerId === currentServerId ? s.events.length : 0
  )

  const handleLeave = useCallback(async () => {
    if (!currentServer) return
    if (!confirm(`Leave ${currentServer.name}? You will need a new invite to rejoin.`)) return
    try {
      await api.leaveServer(currentServer.id)
      removeServer(currentServer.id)
      close()
    } catch {
      /* ignore */
    }
  }, [currentServer, removeServer, close])

  const hasDmUnread = Array.from(dmReadStates.values()).some((rs) => rs.unreadCount > 0)

  const computeServerBadgeFn = useCallback(
    (serverId: string) => computeServerBadge(serverId, getEffective),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEffective, channelReadStates, channelToServer, notifPrefs, serverPrefs]
  )

  const getNotifLevel = useCallback(
    (channelId: string) => getEffective(channelId, currentServer?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifPrefs, serverPrefs, currentServer?.id, getEffective]
  )

  const { uncategorizedText, uncategorizedVoice, uncategorizedForum, categoryGroups } = useSortedChannels(channels, storeCategories)

  const handleServerClick = useCallback(
    (server: Server) => {
      void orchestratedGoToChannel(server.id)
    },
    [orchestratedGoToChannel]
  )

  const handleDmClick = useCallback(() => {
    goToDms()
  }, [goToDms])

  const handleChannelClick = useCallback(
    (ch: Channel) => {
      if (currentServerId) void orchestratedGoToChannel(currentServerId, ch.id)
      useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
      close()
    },
    [currentServerId, orchestratedGoToChannel, close]
  )

  const handleVoiceChannelClick = useCallback(
    (ch: Channel) => {
      const store = useVoiceConnectionStore.getState()
      if (store.currentChannelId === ch.id) {
        store.setViewingVoiceRoom(true)
      } else if (currentServerId) {
        import('@/lib/voiceConnect').then(({ joinVoiceChannel }) => joinVoiceChannel(currentServerId, ch.id, ch.name))
      }
      close()
    },
    [currentServerId, close]
  )

  const handleConvClick = useCallback(
    (convId: string) => {
      goToDm(convId)
      close()
    },
    [goToDm, close]
  )

  const getConvDisplayInfo = useCallback(
    (conv: (typeof conversations)[0]) => {
      if (conv.isGroup) {
        return {
          name: conv.groupName || conv.members.map((m) => m.displayName ?? m.username).join(', '),
          avatarUrl: null as string | null,
          status: 'online' as const,
          isGroup: true
        }
      }
      const other = conv.members.find((m) => m.userId !== user?.id)
      return {
        name: other?.displayName ?? other?.username ?? 'Unknown',
        avatarUrl: other?.avatarUrl ?? null,
        status: (onlineIds.has(other?.userId ?? '') ? 'online' : 'offline') as 'online' | 'offline',
        isGroup: false
      }
    },
    [user?.id, onlineIds]
  )

  return (
    <>
      <MobileDrawer open={open} onClose={close} side="left" width="w-72">
        <div className="flex h-full flex-col bg-surface-dark" onContextMenu={(e) => e.preventDefault()}>
          {/* Server row */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-black/20 px-3 py-2">
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={handleDmClick}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  viewMode === 'dm'
                    ? 'bg-primary text-primary-text'
                    : 'bg-surface text-gray-300 hover:bg-primary hover:text-primary-text'
                }`}
              >
                <DmIcon />
              </button>
              {hasDmUnread && viewMode !== 'dm' && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
              )}
            </div>
            <div className="h-6 w-px shrink-0 bg-white/15" />
            {servers.map((s) => {
              const active = viewMode === 'server' && s.id === currentServerId
              const badge = active ? null : computeServerBadgeFn(s.id)
              return (
                <div key={s.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => handleServerClick(s)}
                    title={s.name}
                    className={`flex h-10 w-10 items-center justify-center overflow-hidden text-xs font-semibold text-white transition ${
                      active ? 'rounded-xl bg-primary' : 'rounded-full bg-surface hover:rounded-xl hover:bg-primary'
                    }`}
                  >
                    {s.iconUrl ? (
                      <img src={resolveMediaUrl(s.iconUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      s.name.charAt(0).toUpperCase()
                    )}
                  </button>
                  {badge && badge.mentions > 0 && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface-dark bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
                      {badge.mentions > 10 ? '10+' : badge.mentions}
                    </span>
                  )}
                  {badge && badge.unread && badge.mentions === 0 && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-dark bg-red-500" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Server name + dropdown trigger */}
          {viewMode === 'server' && currentServer && (
            <button
              type="button"
              onClick={() => setServerMenuOpen(true)}
              className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/20 px-3 transition active:bg-white/[0.06]"
            >
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white">{currentServer.name}</span>
              <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          {/* Channel / DM list */}
          <SimpleBar className="min-h-0 flex-1 px-2 py-2">
            {viewMode === 'server' ? (
              <>
                {/* Uncategorized text channels */}
                {(uncategorizedText.length > 0 || categoryGroups.length === 0) && (
                  <>
                    <div className="mb-1 flex items-center justify-between px-2">
                      <SectionHeading as="span">TEXT CHANNELS</SectionHeading>
                      {isAdminOrOwner && (
                        <IconButton
                          label="Create channel"
                          size="sm"
                          onClick={() => {
                            close()
                            setChannelModalOpen(true)
                          }}
                          className="p-0.5"
                        >
                          <PlusSmallIcon />
                        </IconButton>
                      )}
                    </div>
                    <ul className="space-y-0.5">
                      {uncategorizedText.map((ch) => {
                        const active = ch.id === currentChannelId && !viewingVoiceRoom
                        const { showUnread: showUnreadDot, mentionCount, hasIndicator } = computeChannelBadge(
                          channelReadStates.get(ch.id), getEffective(ch.id, currentServer?.id) as NotifLevel, active
                        )
                        return (
                          <li key={ch.id}>
                            <button
                              type="button"
                              onClick={(e) => {
                                if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; return }
                                handleChannelClick(ch)
                              }}
                              onTouchStart={() => handleChannelTouchStart(ch)}
                              onTouchEnd={handleChannelTouchEnd}
                              onTouchMove={handleChannelTouchMove}
                              onContextMenu={handleChannelContextMenu}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                                active ? 'bg-surface-selected text-white' : hasIndicator ? 'font-semibold text-white hover:bg-white/[0.06]' : 'text-gray-300 hover:bg-white/[0.06]'
                              }`}
                            >
                              <HashIcon />
                              <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                              {mentionCount > 0 && <CountBadge count={mentionCount} variant="danger" max={10} />}
                              {showUnreadDot && mentionCount === 0 && (<span className="h-2 w-2 shrink-0 rounded-full bg-primary" />)}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}

                {/* Category groups */}
                {categoryGroups.map((group) => {
                  const isCollapsed = collapsedCategoryIds.includes(group.category.id)
                  return (
                    <div key={group.category.id} className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleCollapsedCategory(group.category.id)}
                        className="mb-1 flex w-full items-center gap-1 px-2 text-left"
                      >
                        <svg className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" /></svg>
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.category.name}</span>
                      </button>
                      {!isCollapsed && (
                        <>
                          {group.textChannels.length > 0 && (
                            <ul className="space-y-0.5">
                              {group.textChannels.map((ch) => {
                                const active = ch.id === currentChannelId && !viewingVoiceRoom
                                const { showUnread: showUnreadDot, mentionCount, hasIndicator } = computeChannelBadge(
                                  channelReadStates.get(ch.id), getEffective(ch.id, currentServer?.id) as NotifLevel, active
                                )
                                return (
                                  <li key={ch.id}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; return }
                                        handleChannelClick(ch)
                                      }}
                                      onTouchStart={() => handleChannelTouchStart(ch)}
                                      onTouchEnd={handleChannelTouchEnd}
                                      onTouchMove={handleChannelTouchMove}
                                      onContextMenu={handleChannelContextMenu}
                                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                                        active ? 'bg-surface-selected text-white' : hasIndicator ? 'font-semibold text-white hover:bg-white/[0.06]' : 'text-gray-300 hover:bg-white/[0.06]'
                                      }`}
                                    >
                                      <HashIcon />
                                      <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                                      {mentionCount > 0 && <CountBadge count={mentionCount} variant="danger" max={10} />}
                                      {showUnreadDot && mentionCount === 0 && (<span className="h-2 w-2 shrink-0 rounded-full bg-primary" />)}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                          {group.voiceChannels.length > 0 && (
                            <ul className="space-y-0.5">
                              {group.voiceChannels.map((ch) => {
                                const participants = voiceParticipants[ch.id] ?? []
                                const inThis = currentVoiceChannelId === ch.id
                                return (
                                  <li key={ch.id}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; return }
                                        handleVoiceChannelClick(ch)
                                      }}
                                      onTouchStart={() => handleChannelTouchStart(ch)}
                                      onTouchEnd={handleChannelTouchEnd}
                                      onTouchMove={handleChannelTouchMove}
                                      onContextMenu={handleChannelContextMenu}
                                      className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${inThis ? 'text-white' : 'text-gray-300 hover:bg-white/[0.06]'}`}
                                    >
                                      <SpeakerIcon />
                                      <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                                      {participants.length > 0 && (<span className="text-xs text-gray-400">{participants.length}</span>)}
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                          {group.forumChannels.length > 0 && (
                            <ul className="space-y-0.5">
                              {group.forumChannels.map((ch) => (
                                <ForumChannelItem
                                  key={ch.id}
                                  ch={ch}
                                  compact
                                  active={ch.id === currentChannelId && !viewingVoiceRoom}
                                  channelReadStates={channelReadStates}
                                  getNotifLevel={getNotifLevel}
                                  longPressFired={longPressFired}
                                  currentServer={currentServer}
                                  orchestratedGoToChannel={orchestratedGoToChannel}
                                  handleChannelTouchStart={handleChannelTouchStart}
                                  handleChannelTouchEnd={handleChannelTouchEnd}
                                  handleChannelTouchMove={handleChannelTouchMove}
                                  handleChannelContextMenu={handleChannelContextMenu}
                                />
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Uncategorized voice channels */}
                {uncategorizedVoice.length > 0 && (
                  <>
                    <div className="mb-1 mt-3 flex items-center justify-between px-2">
                      <SectionHeading as="span">VOICE CHANNELS</SectionHeading>
                      {isAdminOrOwner && (
                        <IconButton
                          label="Create channel"
                          size="sm"
                          onClick={() => { close(); setChannelModalOpen(true) }}
                          className="p-0.5"
                        >
                          <PlusSmallIcon />
                        </IconButton>
                      )}
                    </div>
                    <ul className="space-y-0.5">
                      {uncategorizedVoice.map((ch) => {
                        const participants = voiceParticipants[ch.id] ?? []
                        const inThis = currentVoiceChannelId === ch.id
                        return (
                          <li key={ch.id}>
                            <button
                              type="button"
                              onClick={(e) => {
                                if (longPressFired.current) { e.preventDefault(); e.stopPropagation(); longPressFired.current = false; return }
                                handleVoiceChannelClick(ch)
                              }}
                              onTouchStart={() => handleChannelTouchStart(ch)}
                              onTouchEnd={handleChannelTouchEnd}
                              onTouchMove={handleChannelTouchMove}
                              onContextMenu={handleChannelContextMenu}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${inThis ? 'text-white' : 'text-gray-300 hover:bg-white/[0.06]'}`}
                            >
                              <SpeakerIcon />
                              <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                              {participants.length > 0 && (<span className="text-xs text-gray-400">{participants.length}</span>)}
                            </button>
                            {participants.length > 0 && (
                              <ul className="ml-4 space-y-0.5">
                                {participants.map((p) => {
                                  const member = members.find((m) => m.userId === p.userId)
                                  return (
                                    <li key={p.userId} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                                      <UserAvatar username={p.username} avatarUrl={member?.user.avatarUrl} size="sm" />
                                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-300">{member?.user.displayName || p.username}</span>
                                      <VoiceStatusIcons participant={p} />
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
                {uncategorizedForum.length > 0 && (
                  <>
                    <div className="mb-1 mt-3 flex items-center justify-between px-2">
                      <SectionHeading as="span">FORUM CHANNELS</SectionHeading>
                      {isAdminOrOwner && (
                        <IconButton
                          label="Create channel"
                          size="sm"
                          onClick={() => { close(); setChannelModalOpen(true) }}
                          className="p-0.5"
                        >
                          <PlusSmallIcon />
                        </IconButton>
                      )}
                    </div>
                    <ul className="space-y-0.5">
                      {uncategorizedForum.map((ch) => (
                        <ForumChannelItem
                          key={ch.id}
                          ch={ch}
                          compact
                          active={ch.id === currentChannelId && !viewingVoiceRoom}
                          channelReadStates={channelReadStates}
                          getNotifLevel={getNotifLevel}
                          longPressFired={longPressFired}
                          currentServer={currentServer}
                          orchestratedGoToChannel={orchestratedGoToChannel}
                          handleChannelTouchStart={handleChannelTouchStart}
                          handleChannelTouchEnd={handleChannelTouchEnd}
                          handleChannelTouchMove={handleChannelTouchMove}
                          handleChannelContextMenu={handleChannelContextMenu}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { goToDms(); close() }}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                  </svg>
                  {t('friends')}
                  <CountBadge count={pendingFriendCount} variant="danger" className="ml-auto" />
                </button>
                <div className="mb-1 flex items-center justify-between px-2">
                  <SectionHeading>{t('directMessages').toUpperCase()}</SectionHeading>
                  <IconButton
                    label={t('newMessage')}
                    onClick={() => {
                      close()
                      setGroupDmOpen(true)
                    }}
                  >
                    <PlusSmallIcon />
                  </IconButton>
                </div>
                <input
                  value={dmFilter}
                  onChange={(e) => setDmFilter(e.target.value)}
                  placeholder={t('findConversation')}
                  className="mb-1 w-full rounded-md bg-surface-darkest px-2.5 py-1.5 text-sm text-gray-200 outline-none placeholder:text-gray-500"
                />
                <ul className="space-y-0.5">
                  {filteredConversations.map((conv) => {
                    const info = getConvDisplayInfo(conv)
                    const active = conv.id === currentConvId
                    const rs = dmReadStates.get(conv.id)
                    const hasUnread = !active && rs && rs.unreadCount > 0
                    return (
                      <li key={conv.id} className="group/dm relative">
                        <button
                          type="button"
                          onClick={() => handleConvClick(conv.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                            active
                              ? 'bg-surface-selected text-white'
                              : hasUnread
                                ? 'font-semibold text-white hover:bg-white/[0.06]'
                                : 'text-gray-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <UserAvatar
                            username={info.name}
                            avatarUrl={info.avatarUrl}
                            size="sm"
                            showStatus
                            status={info.status}
                          />
                          <span className="min-w-0 flex-1 truncate text-left">{info.name}</span>
                          {hasUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
                        </button>
                        <IconButton
                          label={t('closeConversation')}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            void closeConv(conv.id)
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 opacity-60 hover:text-white"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </IconButton>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </SimpleBar>

          {/* Voice panel */}
          <VoicePanel onGoToVoiceRoom={handleGoToVoiceRoom} />

          {/* User footer */}
          <UserFooter
            onOpenSettings={(tab) => { close(); onOpenSettings(tab) }}
            className="border-t border-black/20 px-3 py-2"
          >
            <IconButton
              label="Quick switcher"
              size="lg"
              onClick={() => { close(); onOpenQuickSwitcher() }}
              className="rounded-md"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </IconButton>
          </UserFooter>
        </div>
      </MobileDrawer>

      {serverMenuOpen && currentServer && (
        <ServerMenuSheet
          server={currentServer}
          isAdminOrOwner={isAdminOrOwner}
          isOwner={isOwner}
          eventCount={eventCount}
          onClose={() => setServerMenuOpen(false)}
          onServerSettings={() => {
            setServerMenuOpen(false); close(); setServerSettingsOpen(true)
          }}
          onReorder={() => {
            setServerMenuOpen(false); close(); setReorderOpen(true)
          }}
          onCreateCategory={() => {
            setServerMenuOpen(false); close(); setCreateCategoryOpen(true)
          }}
          onMarkAllRead={() => {
            setServerMenuOpen(false)
            if (currentServer) useReadStateStore.getState().ackServer(currentServer.id)
          }}
          onNotifSettings={() => {
            setServerMenuOpen(false); close(); setServerNotifOpen(true)
          }}
          onInvite={() => {
            setServerMenuOpen(false); close(); setInviteOpen(true)
          }}
          onEvents={() => {
            setServerMenuOpen(false); close(); setEventsOpen(true)
          }}
          onChangeRoles={() => {
            setServerMenuOpen(false); close(); setRolePickerOpen(true)
          }}
          onLeave={() => {
            setServerMenuOpen(false); void handleLeave()
          }}
        />
      )}

      {inviteOpen && currentServer && (
        <Suspense fallback={null}>
          <InviteModal serverId={currentServer.id} serverName={currentServer.name} onClose={() => setInviteOpen(false)} />
        </Suspense>
      )}
      {serverSettingsOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
        </Suspense>
      )}
      {eventsOpen && currentServer && (
        <Suspense fallback={null}>
          <EventsPanel serverId={currentServer.id} onClose={() => setEventsOpen(false)} />
        </Suspense>
      )}
      {reorderOpen && (
        <Suspense fallback={null}>
          <ReorderChannelsModal onClose={() => setReorderOpen(false)} />
        </Suspense>
      )}
      {createCategoryOpen && (
        <Suspense fallback={null}>
          <CreateCategoryModal onClose={() => setCreateCategoryOpen(false)} />
        </Suspense>
      )}
      {serverNotifOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerNotifModal serverId={currentServer.id} serverName={currentServer.name} onClose={() => setServerNotifOpen(false)} />
        </Suspense>
      )}
      {rolePickerOpen && currentServer && (
        <Suspense fallback={null}>
          <RolePickerModal onClose={() => setRolePickerOpen(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <CreateChannelModal open={channelModalOpen} onClose={() => setChannelModalOpen(false)} />
      </Suspense>
      {editingChannel && (
        <Suspense fallback={null}>
          <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)} />
        </Suspense>
      )}
      {drawerChannel && (
        <ChannelOptionsDrawer
          channel={drawerChannel}
          isAdminOrOwner={isAdminOrOwner}
          onClose={() => setDrawerChannel(null)}
          onEditChannel={() => {
            close()
            setEditingChannel(drawerChannel)
          }}
          onOpenPinned={handleDrawerOpenPinned}
        />
      )}
      {groupDmOpen && (
        <GroupDmModal
          conversations={conversations}
          currentUserId={user?.id}
          onClose={() => setGroupDmOpen(false)}
          onCreated={(conv) => {
            useDmStore.getState().addOrUpdateConversation(conv)
            goToDm(conv.id)
            setGroupDmOpen(false)
          }}
          onExisting={(convId) => {
            goToDm(convId)
            setGroupDmOpen(false)
          }}
        />
      )}
    </>
  )
}
