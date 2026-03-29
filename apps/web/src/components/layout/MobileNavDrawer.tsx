import type { Channel } from '@chat/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import SimpleBar from 'simplebar-react'
import { ChannelOptionsDrawer } from '@/components/channel/ChannelOptionsDrawer'
import { CreateChannelModal } from '@/components/channel/CreateChannelModal'
import { GroupDmModal } from '@/components/dm/GroupDmModal'
import { EditChannelModal } from '@/components/channel/EditChannelModal'
import { InviteModal } from '@/components/server/InviteModal'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import { ServerSettingsModal } from '@/components/server/ServerSettingsModal'
import { UserAvatar } from '@/components/UserAvatar'
import { VoicePanel } from '@/components/voice/VoicePanel'
import { api, resolveMediaUrl } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useSortedChannels } from '@/hooks/useSortedChannels'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useMemberStore } from '@/stores/member.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { type Server, useServerStore } from '@/stores/server.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { type VoiceParticipant, useVoiceStore } from '@/stores/voice.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'

const EventsPanel = React.lazy(() =>
  import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel }))
)
const ReorderChannelsModal = React.lazy(() =>
  import('@/components/server/ReorderChannelsModal').then((m) => ({ default: m.ReorderChannelsModal }))
)

function DmIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v10h16V6H4zm2 2h8v2H6V8zm0 4h5v2H6v-2z" />
    </svg>
  )
}

function HashIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}

function VoiceStatusIcons({ participant }: { participant: VoiceParticipant }) {
  const icons: React.ReactNode[] = []
  if (participant.muted) {
    icons.push(
      <svg key="m" className="h-3 w-3 text-red-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>
    )
  }
  if (participant.deafened) {
    icons.push(
      <svg key="d" className="h-3 w-3 text-red-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12v4.5C2 18.43 3.57 20 5.5 20H9V12H4c0-4.42 3.58-8 8-8s8 3.58 8 8h-5v8h3.5c1.93 0 3.5-1.57 3.5-3.5V12c0-5.52-4.48-10-10-10z" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" />
      </svg>
    )
  }
  if (icons.length === 0) return null
  return <span className="flex items-center gap-0.5">{icons}</span>
}

export function MobileNavDrawer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const open = useLayoutStore((s) => s.navDrawerOpen)
  const close = useLayoutStore((s) => s.closeNavDrawer)

  const { orchestratedGoToChannel, goToDms, goToDm } = useAppNavigate()

  const viewMode = useServerStore((s) => s.viewMode)
  const servers = useServerStore((s) => s.servers)
  const currentServerId = useServerStore((s) => s.currentServerId)

  const channels = useChannelStore((s) => s.channels)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)

  const conversations = useDmStore((s) => s.conversations)
  const currentConvId = useDmStore((s) => s.currentConversationId)
  const fetchConversations = useDmStore((s) => s.fetchConversations)

  useEffect(() => {
    if (viewMode === 'dm') fetchConversations()
  }, [viewMode, fetchConversations])

  const user = useAuthStore((s) => s.user)
  const onlineIds = useMemberStore((s) => s.onlineUserIds)
  const dmReadStates = useReadStateStore((s) => s.dms)
  const pendingFriendCount = useFriendStore((s) => s.pending.length)
  const channelReadStates = useReadStateStore((s) => s.channels)
  const notifPrefs = useNotifPrefStore((s) => s.prefs)
  const getNotifLevel = useCallback(
    (channelId: string) => (notifPrefs[channelId] ?? 'all') as 'all' | 'mentions' | 'none',
    [notifPrefs]
  )
  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom)
  const voiceParticipants = useVoiceStore((s) => s.participants)
  const currentVoiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const voiceServerId = useVoiceConnectionStore((s) => s.currentServerId)

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
  const [dmFilter, setDmFilter] = useState('')
  const closeConv = useDmStore((s) => s.closeConversation)

  const members = useMemberStore((s) => s.members)
  const myMembership = members.find((m) => m.userId === user?.id)
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin'

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
  const removeServer = useServerStore((s) => s.removeServer)
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

  const storeCategories = useChannelStore((s) => s.categories)
  const collapsedCategories = useChannelStore((s) => s.collapsedCategories)
  const toggleCategoryCollapsed = useChannelStore((s) => s.toggleCategoryCollapsed)
  const { uncategorizedText, uncategorizedVoice, categoryGroups } = useSortedChannels(channels, storeCategories)

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
                    ? 'bg-primary text-white'
                    : 'bg-surface text-gray-300 hover:bg-primary hover:text-white'
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
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleServerClick(s)}
                  title={s.name}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-xs font-semibold text-white transition ${
                    active ? 'rounded-xl bg-primary' : 'rounded-full bg-surface hover:rounded-xl hover:bg-primary'
                  }`}
                >
                  {s.iconUrl ? (
                    <img src={resolveMediaUrl(s.iconUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    s.name.charAt(0).toUpperCase()
                  )}
                </button>
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
                      <span className="text-[11px] font-semibold tracking-wide text-gray-400">TEXT CHANNELS</span>
                      {isAdminOrOwner && (
                        <button
                          type="button"
                          title="Create channel"
                          onClick={() => {
                            close()
                            setChannelModalOpen(true)
                          }}
                          className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                        >
                          <PlusSmallIcon />
                        </button>
                      )}
                    </div>
                    <ul className="space-y-0.5">
                      {uncategorizedText.map((ch) => {
                        const active = ch.id === currentChannelId && !viewingVoiceRoom
                        const rs = channelReadStates.get(ch.id)
                        const level = getNotifLevel(ch.id)
                        const showUnreadDot = level === 'all' && !active && rs != null && rs.unreadCount > 0
                        const showMentions = level !== 'none' && !active && (rs?.mentionCount ?? 0) > 0
                        const mentionCount = showMentions ? rs!.mentionCount : 0
                        const hasIndicator = showUnreadDot || showMentions
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
                              {mentionCount > 0 && (<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{mentionCount}</span>)}
                              {showUnreadDot && mentionCount === 0 && (<span className="h-2 w-2 shrink-0 rounded-full bg-white" />)}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}

                {/* Category groups */}
                {categoryGroups.map((group) => {
                  const isCollapsed = collapsedCategories.has(group.category.id)
                  return (
                    <div key={group.category.id} className="mt-2">
                      <button
                        type="button"
                        onClick={() => toggleCategoryCollapsed(group.category.id)}
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
                                const rs = channelReadStates.get(ch.id)
                                const level = getNotifLevel(ch.id)
                                const showUnreadDot = level === 'all' && !active && rs != null && rs.unreadCount > 0
                                const showMentions = level !== 'none' && !active && (rs?.mentionCount ?? 0) > 0
                                const mentionCount = showMentions ? rs!.mentionCount : 0
                                const hasIndicator = showUnreadDot || showMentions
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
                                      {mentionCount > 0 && (<span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{mentionCount}</span>)}
                                      {showUnreadDot && mentionCount === 0 && (<span className="h-2 w-2 shrink-0 rounded-full bg-white" />)}
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
                        </>
                      )}
                    </div>
                  )
                })}

                {/* Uncategorized voice channels */}
                {uncategorizedVoice.length > 0 && (
                  <>
                    <div className="mb-1 mt-3 flex items-center justify-between px-2">
                      <span className="text-[11px] font-semibold tracking-wide text-gray-400">VOICE CHANNELS</span>
                      {isAdminOrOwner && (
                        <button
                          type="button"
                          title="Create channel"
                          onClick={() => { close(); setChannelModalOpen(true) }}
                          className="rounded p-0.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                        >
                          <PlusSmallIcon />
                        </button>
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
                  Friends
                  {pendingFriendCount > 0 && (
                    <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {pendingFriendCount}
                    </span>
                  )}
                </button>
                <div className="mb-1 flex items-center justify-between px-2">
                  <p className="text-[11px] font-semibold tracking-wide text-gray-400">DIRECT MESSAGES</p>
                  <button
                    type="button"
                    title="New Message"
                    aria-label="New Message"
                    onClick={() => {
                      close()
                      setGroupDmOpen(true)
                    }}
                    className="rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <PlusSmallIcon />
                  </button>
                </div>
                <input
                  value={dmFilter}
                  onChange={(e) => setDmFilter(e.target.value)}
                  placeholder="Find a conversation"
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
                          {hasUnread && <span className="h-2 w-2 rounded-full bg-white" />}
                        </button>
                        <button
                          type="button"
                          aria-label="Close conversation"
                          onClick={(e) => {
                            e.stopPropagation()
                            void closeConv(conv.id)
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 opacity-60 transition hover:bg-white/10 hover:text-white"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
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
          <div className="flex shrink-0 items-center gap-2 border-t border-black/20 bg-surface-overlay px-3 py-2">
            <UserAvatar
              username={user?.username ?? 'User'}
              avatarUrl={user?.avatarUrl}
              size="md"
              showStatus
              status={user?.status ?? 'online'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {user?.displayName ?? user?.username ?? '...'}
              </p>
              <p className="truncate text-xs capitalize text-gray-400">{user?.status ?? 'online'}</p>
            </div>
            <button
              type="button"
              title="User settings"
              aria-label="User settings"
              onClick={onOpenSettings}
              className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <GearIcon />
            </button>
          </div>
        </div>
      </MobileDrawer>

      {/* Server menu modal */}
      {serverMenuOpen && currentServer && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setServerMenuOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-2xl bg-surface-dark shadow-2xl ring-1 ring-white/10"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="text-sm font-semibold text-white">{currentServer.name}</span>
              <button
                type="button"
                onClick={() => setServerMenuOpen(false)}
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-col py-2">
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setServerMenuOpen(false)
                    close()
                    setServerSettingsOpen(true)
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
                >
                  <GearIcon />
                  Server Settings
                </button>
              )}
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setServerMenuOpen(false)
                    close()
                    setReorderOpen(true)
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z" />
                  </svg>
                  Reorder Channels
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false)
                  close()
                  setInviteOpen(true)
                }}
                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
                Invite People
              </button>
              <button
                type="button"
                onClick={() => {
                  setServerMenuOpen(false)
                  close()
                  setEventsOpen(true)
                }}
                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Events
                {eventCount > 0 && (
                  <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {eventCount}
                  </span>
                )}
              </button>
              {!isOwner && (
                <>
                  <div className="mx-4 my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={() => {
                      setServerMenuOpen(false)
                      void handleLeave()
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 transition active:bg-red-500/20"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                    </svg>
                    Leave Server
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {inviteOpen && currentServer && (
        <InviteModal serverId={currentServer.id} serverName={currentServer.name} onClose={() => setInviteOpen(false)} />
      )}
      {serverSettingsOpen && currentServer && (
        <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
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
      <CreateChannelModal open={channelModalOpen} onClose={() => setChannelModalOpen(false)} />
      {editingChannel && <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)} />}
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

function PlusSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
    </svg>
  )
}

