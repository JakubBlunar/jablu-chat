import type { Channel, ChannelCategory, UserStatus } from '@chat/shared'
import { hasPermission as hasPermFlag, Permission as SharedPermission } from '@chat/shared'
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useShallow } from 'zustand/react/shallow'
import SimpleBar from 'simplebar-react'
import { useIsMobile } from '@/hooks/useMobile'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ChannelOptionsDrawer } from '@/components/channel/ChannelOptionsDrawer'
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
import { UserFooter } from '@/components/layout/UserFooter'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useSortedChannels } from '@/hooks/useSortedChannels'

const ReorderChannelsModal = React.lazy(() =>
  import('@/components/server/ReorderChannelsModal').then((m) => ({ default: m.ReorderChannelsModal }))
)
const ServerNotifModal = React.lazy(() =>
  import('@/components/server/ServerNotifModal').then((m) => ({ default: m.ServerNotifModal }))
)
const CreateCategoryModal = React.lazy(() =>
  import('@/components/channel/CreateCategoryModal').then((m) => ({ default: m.CreateCategoryModal }))
)
const EditCategoryModal = React.lazy(() =>
  import('@/components/channel/EditCategoryModal').then((m) => ({ default: m.EditCategoryModal }))
)
const RolePickerModal = React.lazy(() =>
  import('@/components/server/RolePickerModal').then((m) => ({ default: m.RolePickerModal }))
)

import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useSettingsStore } from '@/stores/settings.store'
import { getRoleColor, useMemberStore } from '@/stores/member.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useServerStore } from '@/stores/server.store'
import { type VoiceParticipant, useVoiceStore } from '@/stores/voice.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { DownloadAppBanner } from '@/components/settings/DownloadApp'
import { VoicePanel } from '@/components/voice/VoicePanel'
import { ProfileCard, type ProfileCardUser } from '@/components/ProfileCard'
import { useEventStore } from '@/stores/event.store'
import {
  PlusSmallIcon,
  InviteIcon,
  LeaveIcon,
  GearIcon,
  ReorderIcon,
  ChevronDownIcon,
  GearSmallIcon
} from './channel-sidebar/sidebarIcons'
import { useSpeakingUsers } from './channel-sidebar/VoiceComponents'
import { ForumChannelItem } from './channel-sidebar/ForumChannelItem'
import { TextChannelItem } from './channel-sidebar/TextChannelItem'
import { VoiceChannelItem } from './channel-sidebar/VoiceChannelItem'

const EventsPanel = React.lazy(() =>
  import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel }))
)

export function ChannelSidebar({ onOpenSettings }: { onOpenSettings: (tab?: string) => void }) {
  const user = useAuthStore((s) => s.user)

  const { currentServer, removeServer } = useServerStore(
    useShallow((s) => {
      const id = s.currentServerId
      const currentServer = id ? s.servers.find((x) => x.id === id) ?? null : null
      return { currentServer, removeServer: s.removeServer }
    })
  )
  const { orchestratedGoToChannel } = useAppNavigate()
  const { channelsLoading, channels, categories, currentChannelId } = useChannelStore(
    useShallow((s) => ({
      channelsLoading: s.isLoading,
      channels: s.channels,
      categories: s.categories,
      currentChannelId: s.currentChannelId
    }))
  )

  const { collapsedCategoryIds, toggleCollapsedCategory } = useSettingsStore(
    useShallow((s) => ({
      collapsedCategoryIds: s.collapsedCategoryIds,
      toggleCollapsedCategory: s.toggleCollapsedCategory
    }))
  )

  const permissionsMap = useChannelPermissionsStore((s) => s.permissionsMap)
  const visibleChannels = useMemo(
    () =>
      channels.filter((ch) => {
        const perms = permissionsMap[ch.id]
        if (perms === undefined) return true
        return hasPermFlag(perms, SharedPermission.VIEW_CHANNEL)
      }),
    [channels, permissionsMap]
  )

  const { textChannels, uncategorizedText, uncategorizedVoice, uncategorizedForum, categoryGroups, archivedChannels } = useSortedChannels(visibleChannels, categories)
  const [showArchived, setShowArchived] = useState(false)

  const { has: hasPerm } = usePermissions(currentServer?.id)
  const isAdminOrOwner = hasPerm(Permission.MANAGE_CHANNELS)

  const isOwner = currentServer?.ownerId === user?.id
  const voiceParticipants = useVoiceStore((s) => s.participants)
  const { currentVoiceChannelId, viewingVoiceRoom } = useVoiceConnectionStore(
    useShallow((s) => ({
      currentVoiceChannelId: s.currentChannelId ?? s.voiceNetworkDropout?.channelId ?? null,
      viewingVoiceRoom: s.viewingVoiceRoom
    }))
  )
  const speakingUsers = useSpeakingUsers()

  const { channelReadStates, ackChannel, ackServer } = useReadStateStore(
    useShallow((s) => ({
      channelReadStates: s.channels,
      ackChannel: s.ackChannel,
      ackServer: s.ackServer
    }))
  )
  const { notifPrefs, serverPrefs, getEffective } = useNotifPrefStore(
    useShallow((s) => ({
      notifPrefs: s.prefs,
      serverPrefs: s.serverPrefs,
      getEffective: s.getEffective
    }))
  )
  const getNotifLevel = useCallback(
    (channelId: string) => getEffective(channelId, currentServer?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifPrefs, serverPrefs, currentServer?.id, getEffective]
  )

  const isMobile = useIsMobile()
  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [voiceCardUser, setVoiceCardUser] = useState<ProfileCardUser | null>(null)
  const [voiceCardRect, setVoiceCardRect] = useState<DOMRect | null>(null)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [serverNotifOpen, setServerNotifOpen] = useState(false)
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null)

  const [rolePickerOpen, setRolePickerOpen] = useState(false)
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
      if (!isMobile) return
      longPressFired.current = false
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        setDrawerChannel(ch)
      }, 500)
    },
    [isMobile]
  )

  const handleChannelTouchEnd = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleChannelTouchMove = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleChannelContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isMobile) e.preventDefault()
    },
    [isMobile]
  )

  const handleDrawerOpenPinned = useCallback(() => {
    if (!drawerChannel) return
    if (currentServer) void orchestratedGoToChannel(currentServer.id, drawerChannel.id)
    useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
    setTimeout(() => window.dispatchEvent(new CustomEvent('open-pinned')), 100)
  }, [drawerChannel, currentServer, orchestratedGoToChannel])

  const eventCount = useEventStore((s) =>
    currentServer && s.loadedServerId === currentServer.id ? s.events.length : 0
  )
  const fetchEvents = useEventStore((s) => s.fetchEvents)

  useEffect(() => {
    if (currentServer) fetchEvents(currentServer.id)
  }, [currentServer?.id, fetchEvents])

  const { members, onlineUserIds } = useMemberStore(
    useShallow((s) => ({ members: s.members, onlineUserIds: s.onlineUserIds }))
  )

  const handleVoiceParticipantClick = useCallback(
    (p: VoiceParticipant, e: React.MouseEvent) => {
      if (p.userId === user?.id) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const member = members.find((m) => m.userId === p.userId)
      const resolvedStatus: UserStatus = !onlineUserIds.has(p.userId)
        ? 'offline'
        : (member?.user.status as UserStatus) || 'online'
      setVoiceCardUser({
        id: p.userId,
        username: p.username,
        displayName: member?.user.displayName,
        avatarUrl: member?.user.avatarUrl,
        bio: member?.user.bio ?? null,
        isBot: member?.user.isBot,
        status: resolvedStatus,
        customStatus: member?.user.customStatus ?? null,
        joinedAt: member?.joinedAt,
        roleName: (() => { const r = member?.roles?.filter((r) => !r.isDefault); return r && r.length > 0 ? r.reduce((a, b) => a.position > b.position ? a : b).name : null })(),
        roleColor: member ? getRoleColor(member) : null
      })
      setVoiceCardRect(rect)
    },
    [user?.id, members, onlineUserIds]
  )

  useEffect(() => {
    if (currentChannelId && !viewingVoiceRoom) {
      ackChannel(currentChannelId)
    }
    return () => {
      if (currentChannelId && !viewingVoiceRoom) {
        ackChannel(currentChannelId)
      }
    }
  }, [currentChannelId, viewingVoiceRoom, ackChannel])

  const handleVoiceChannelClick = useCallback(
    (ch: Channel) => {
      const store = useVoiceConnectionStore.getState()
      if (store.currentChannelId === ch.id) {
        store.setViewingVoiceRoom(true)
        return
      }
      if (!currentServer) return
      import('@/lib/voiceConnect').then(({ joinVoiceChannel }) => joinVoiceChannel(currentServer.id, ch.id, ch.name))
    },
    [currentServer]
  )

  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const handleLeaveConfirmed = useCallback(async () => {
    if (!currentServer) return
    setShowLeaveConfirm(false)
    setLeaveError(null)
    try {
      await api.leaveServer(currentServer.id)
      removeServer(currentServer.id)
    } catch {
      setLeaveError('Failed to leave server')
    }
  }, [currentServer, removeServer])

  const sidebarWidth = useSettingsStore((s) => s.channelSidebarWidth)
  const setSidebarWidth = useSettingsStore((s) => s.setChannelSidebarWidth)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [menuOpen])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = useSettingsStore.getState().channelSidebarWidth

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        setSidebarWidth(startW + delta)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setSidebarWidth]
  )

  return (
    <>
      <aside className="relative flex h-full shrink-0 flex-col bg-surface-dark" style={{ width: sidebarWidth }}>
        {/* Drag handle */}
        <div
          className="absolute right-0 top-0 z-30 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40"
          onMouseDown={handleDragStart}
        />

        {/* Server name header with dropdown */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={() => currentServer && setMenuOpen((v) => !v)}
            className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/20 px-3 shadow-sm transition hover:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-white">
              {currentServer?.name ?? 'Select a server'}
            </span>
            {currentServer && (
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {menuOpen && currentServer && (
            <div className="absolute left-2 right-2 top-12 z-40 overflow-hidden rounded-md bg-surface-darkest py-1.5 shadow-xl ring-1 ring-white/10">
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setServerSettingsOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
                >
                  <GearIcon />
                  Server Settings
                </button>
              )}
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setReorderOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
                >
                  <ReorderIcon />
                  Reorder Channels
                </button>
              )}
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setCreateCategoryOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
                >
                  <PlusSmallIcon />
                  Create Category
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  if (currentServer) ackServer(currentServer.id)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Mark All as Read
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setServerNotifOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                Notification Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setInviteOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
              >
                <InviteIcon />
                Invite People
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setEventsOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Events
                {eventCount > 0 && (
                  <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {eventCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setRolePickerOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-primary-text"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Change Roles
              </button>
              {!isOwner && (
                <>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setShowLeaveConfirm(true)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20"
                  >
                    <LeaveIcon />
                    Leave Server
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {leaveError && (
          <div className="mx-2 mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">{leaveError}</div>
        )}

        <SimpleBar className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-3">
          {channelsLoading && !textChannels.length && currentServer ? (
            <div className="space-y-2 px-1">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
            </div>
          ) : null}

          {currentServer && eventCount > 0 && (
            <button
              type="button"
              onClick={() => setEventsOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Events
              <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {eventCount}
              </span>
            </button>
          )}

          {/* Uncategorized text channels */}
          {(uncategorizedText.length > 0 || categoryGroups.length === 0) && (
            <>
              <div className="group/header flex items-center justify-between px-2 pt-1">
                <SectionHeading as="span">TEXT CHANNELS</SectionHeading>
                {isAdminOrOwner && (
                  <button
                    type="button"
                    title="Create channel"
                    aria-label="Create text channel"
                    disabled={!currentServer}
                    onClick={() => setChannelModalOpen(true)}
                    className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                  >
                    <PlusSmallIcon />
                  </button>
                )}
              </div>
              <ul className="space-y-0.5">
                {uncategorizedText.map((ch) => (
                  <TextChannelItem
                    key={ch.id}
                    ch={ch}
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

          {/* Category groups */}
          {categoryGroups.map((group) => {
            const isCollapsed = collapsedCategoryIds.includes(group.category.id)
            const hasChannels = group.textChannels.length > 0 || group.voiceChannels.length > 0 || group.forumChannels.length > 0
            return (
              <div key={group.category.id} className="mt-1">
                <div className="group/header flex items-center justify-between px-1 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleCollapsedCategory(group.category.id)}
                    className="flex min-w-0 flex-1 items-center gap-0.5 text-left"
                  >
                    <ChevronDownIcon collapsed={isCollapsed} />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {group.category.name}
                    </span>
                  </button>
                  {isAdminOrOwner && (
                    <span className="flex items-center gap-0.5">
                      <button
                        type="button"
                        title="Edit category"
                        aria-label={`Edit ${group.category.name}`}
                        onClick={() => setEditingCategory(group.category)}
                        className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100"
                      >
                        <GearSmallIcon />
                      </button>
                      <button
                        type="button"
                        title="Create channel"
                        aria-label={`Create channel in ${group.category.name}`}
                        disabled={!currentServer}
                        onClick={() => {
                          setCreateCategoryId(group.category.id)
                          setChannelModalOpen(true)
                        }}
                        className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                      >
                        <PlusSmallIcon />
                      </button>
                    </span>
                  )}
                </div>
                {!isCollapsed && hasChannels && (
                  <>
                    {group.textChannels.length > 0 && (
                      <ul className="space-y-0.5">
                        {group.textChannels.map((ch) => (
                          <TextChannelItem
                            key={ch.id}
                            ch={ch}
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
                    {group.voiceChannels.length > 0 && (
                      <ul className="space-y-1">
                        {group.voiceChannels.map((ch) => (
                          <VoiceChannelItem
                            key={ch.id}
                            ch={ch}
                            voiceParticipants={voiceParticipants}
                            currentVoiceChannelId={currentVoiceChannelId}
                            viewingVoiceRoom={viewingVoiceRoom}
                            isAdminOrOwner={isAdminOrOwner}
                            isMobile={isMobile}
                            speakingUsers={speakingUsers}
                            members={members}
                            longPressFired={longPressFired}
                            handleVoiceChannelClick={handleVoiceChannelClick}
                            handleChannelTouchStart={handleChannelTouchStart}
                            handleChannelTouchEnd={handleChannelTouchEnd}
                            handleChannelTouchMove={handleChannelTouchMove}
                            handleChannelContextMenu={handleChannelContextMenu}
                            handleVoiceParticipantClick={handleVoiceParticipantClick}
                            setEditingChannel={setEditingChannel}
                          />
                        ))}
                      </ul>
                    )}
                    {group.forumChannels.length > 0 && (
                      <ul className="space-y-0.5">
                        {group.forumChannels.map((ch) => (
                          <ForumChannelItem
                            key={ch.id}
                            ch={ch}
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
              <div className="group/header mt-3 flex items-center justify-between px-2 pt-1">
                <SectionHeading as="span">VOICE CHANNELS</SectionHeading>
                {isAdminOrOwner && (
                  <button
                    type="button"
                    title="Create channel"
                    aria-label="Create voice channel"
                    disabled={!currentServer}
                    onClick={() => setChannelModalOpen(true)}
                    className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                  >
                    <PlusSmallIcon />
                  </button>
                )}
              </div>
              <ul className="space-y-1">
                {uncategorizedVoice.map((ch) => (
                  <VoiceChannelItem
                    key={ch.id}
                    ch={ch}
                    voiceParticipants={voiceParticipants}
                    currentVoiceChannelId={currentVoiceChannelId}
                    viewingVoiceRoom={viewingVoiceRoom}
                    isAdminOrOwner={isAdminOrOwner}
                    isMobile={isMobile}
                    speakingUsers={speakingUsers}
                    members={members}
                    longPressFired={longPressFired}
                    handleVoiceChannelClick={handleVoiceChannelClick}
                    handleChannelTouchStart={handleChannelTouchStart}
                    handleChannelTouchEnd={handleChannelTouchEnd}
                    handleChannelTouchMove={handleChannelTouchMove}
                    handleChannelContextMenu={handleChannelContextMenu}
                    handleVoiceParticipantClick={handleVoiceParticipantClick}
                    setEditingChannel={setEditingChannel}
                  />
                ))}
              </ul>
            </>
          )}

          {/* Uncategorized forum channels */}
          {uncategorizedForum.length > 0 && (
            <>
              <div className="group/header mt-3 flex items-center justify-between px-2 pt-1">
                <SectionHeading as="span">FORUM CHANNELS</SectionHeading>
                {isAdminOrOwner && (
                  <button
                    type="button"
                    title="Create channel"
                    aria-label="Create forum channel"
                    disabled={!currentServer}
                    onClick={() => setChannelModalOpen(true)}
                    className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
                  >
                    <PlusSmallIcon />
                  </button>
                )}
              </div>
              <ul className="space-y-0.5">
                {uncategorizedForum.map((ch) => (
                  <ForumChannelItem
                    key={ch.id}
                    ch={ch}
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

          {/* Archived channels */}
          {archivedChannels.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="flex w-full items-center gap-1 px-2 pt-1 text-left"
              >
                <ChevronDownIcon collapsed={!showArchived} />
                <span className="text-[11px] font-semibold tracking-wide text-gray-500">
                  ARCHIVED ({archivedChannels.length})
                </span>
              </button>
              {showArchived && (
                <ul className="mt-0.5 space-y-0.5">
                  {archivedChannels.map((ch) => (
                    <TextChannelItem
                      key={ch.id}
                      ch={ch}
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
            </div>
          )}
        </SimpleBar>

        <VoicePanel />
        <DownloadAppBanner />

        <UserFooter onOpenSettings={onOpenSettings} className="h-[52px] px-2" />
      </aside>

      {channelModalOpen && (
        <Suspense fallback={null}>
          <CreateChannelModal open onClose={() => { setChannelModalOpen(false); setCreateCategoryId(null) }} defaultCategoryId={createCategoryId} />
        </Suspense>
      )}
      {inviteOpen && currentServer && (
        <Suspense fallback={null}>
          <InviteModal serverId={currentServer.id} serverName={currentServer.name} vanityCode={currentServer.vanityCode} onClose={() => setInviteOpen(false)} />
        </Suspense>
      )}
      {serverSettingsOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
        </Suspense>
      )}
      {editingChannel && (
        <Suspense fallback={null}>
          <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)} />
        </Suspense>
      )}
      {reorderOpen && (
        <Suspense fallback={null}>
          <ReorderChannelsModal onClose={() => setReorderOpen(false)} />
        </Suspense>
      )}
      {voiceCardUser && (
        <ProfileCard user={voiceCardUser} onClose={() => setVoiceCardUser(null)} anchorRect={voiceCardRect} />
      )}
      {eventsOpen && currentServer && (
        <Suspense fallback={null}>
          <EventsPanel serverId={currentServer.id} onClose={() => setEventsOpen(false)} />
        </Suspense>
      )}
      {serverNotifOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerNotifModal serverId={currentServer.id} serverName={currentServer.name} onClose={() => setServerNotifOpen(false)} />
        </Suspense>
      )}
      {createCategoryOpen && (
        <Suspense fallback={null}>
          <CreateCategoryModal onClose={() => setCreateCategoryOpen(false)} />
        </Suspense>
      )}
      {editingCategory && (
        <Suspense fallback={null}>
          <EditCategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} />
        </Suspense>
      )}
      {drawerChannel && (
        <ChannelOptionsDrawer
          channel={drawerChannel}
          isAdminOrOwner={isAdminOrOwner}
          onClose={() => setDrawerChannel(null)}
          onEditChannel={() => setEditingChannel(drawerChannel)}
          onOpenPinned={handleDrawerOpenPinned}
        />
      )}
      {rolePickerOpen && currentServer && (
        <Suspense fallback={null}>
          <RolePickerModal onClose={() => setRolePickerOpen(false)} />
        </Suspense>
      )}
      {showLeaveConfirm && currentServer && (
        <ConfirmDialog
          title="Leave Server"
          description={`Leave ${currentServer.name}? You will need a new invite to rejoin.`}
          confirmLabel="Leave"
          onConfirm={handleLeaveConfirmed}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </>
  )
}
