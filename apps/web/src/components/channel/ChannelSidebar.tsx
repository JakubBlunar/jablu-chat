import { useServerMenuItems } from '@/hooks/useServerMenuItems'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { CategoryContextMenu } from '@/components/channel/ChannelContextMenu'
import type { Channel, ChannelCategory, UserStatus } from '@chat/shared'
import { hasPermission as hasPermFlag, Permission as SharedPermission } from '@chat/shared'
import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import SimpleBar from 'simplebar-react'
import { useIsTablet } from '@/hooks/useMobile'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ServerProfileModal } from '@/components/server/ServerProfileModal'
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
const LeaderboardModal = React.lazy(() =>
  import('@/components/server/LeaderboardModal').then((m) => ({ default: m.LeaderboardModal }))
)
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
import { PanelResizeHandle } from '@/components/layout/PanelResizeHandle'
import { VoicePanel } from '@/components/voice/VoicePanel'
import { ProfileCard, type ProfileCardUser } from '@/components/ProfileCard'
import { useEventStore } from '@/stores/event.store'
import { formatEventSchedule } from '@/lib/eventTime'
import { ChevronDownIcon } from './channel-sidebar/sidebarIcons'
import { useSpeakingUsers } from './channel-sidebar/VoiceComponents'
import { ForumChannelItem } from './channel-sidebar/ForumChannelItem'
import { TextChannelItem } from './channel-sidebar/TextChannelItem'
import { VoiceChannelItem } from './channel-sidebar/VoiceChannelItem'

const EventsPanel = React.lazy(() =>
  import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel }))
)

export function ChannelSidebar() {
  const { t } = useTranslation('nav')
  const { t: tEvents } = useTranslation('events')
  const user = useAuthStore((s) => s.user)

  const { currentServer, removeServer } = useServerStore(
    useShallow((s) => {
      const id = s.currentServerId
      const currentServer = id ? (s.servers.find((x) => x.id === id) ?? null) : null
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

  const { textChannels, uncategorizedText, uncategorizedVoice, uncategorizedForum, categoryGroups, archivedChannels } =
    useSortedChannels(visibleChannels, categories)
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

  const { channelReadStates, ackServer } = useReadStateStore(
    useShallow((s) => ({
      channelReadStates: s.channels,
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

  const isTablet = useIsTablet()
  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [voiceCardUser, setVoiceCardUser] = useState<ProfileCardUser | null>(null)
  const [voiceCardRect, setVoiceCardRect] = useState<DOMRect | null>(null)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [eventsInitialId, setEventsInitialId] = useState<string | null>(null)
  const [serverNotifOpen, setServerNotifOpen] = useState(false)
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null)

  const [rolePickerOpen, setRolePickerOpen] = useState(false)

  // Command palette hooks: allow global commands to open the sidebar's modals
  // without duplicating the modal ownership elsewhere.
  const canManageServer = isOwner || hasPerm(Permission.MANAGE_SERVER)
  useEffect(() => {
    if (!currentServer) return
    const openChannel = () => {
      if (!isAdminOrOwner) return
      setCreateCategoryId(null)
      setChannelModalOpen(true)
    }
    const openServerSettings = () => {
      if (canManageServer) setServerSettingsOpen(true)
    }
    const openLeaderboard = () => {
      if (!isTablet && currentServer.xpEnabled) setLeaderboardOpen(true)
    }
    window.addEventListener('open-create-channel', openChannel)
    window.addEventListener('open-server-settings', openServerSettings)
    window.addEventListener('open-leaderboard', openLeaderboard)
    return () => {
      window.removeEventListener('open-create-channel', openChannel)
      window.removeEventListener('open-server-settings', openServerSettings)
      window.removeEventListener('open-leaderboard', openLeaderboard)
    }
  }, [currentServer, isAdminOrOwner, canManageServer, isTablet])

  const handleOpenPinned = useCallback(
    (channel: Channel) => {
      if (currentServer) void orchestratedGoToChannel(currentServer.id, channel.id)
      useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-pinned')), 100)
    },
    [currentServer, orchestratedGoToChannel]
  )

  const eventCount = useEventStore((s) =>
    currentServer && s.loadedServerId === currentServer.id ? s.events.length : 0
  )
  // `events` is sorted ascending by startAt. Pick the first that is happening
  // now (active) or hasn't ended yet, so a stale past instance never shows.
  const nextEvent = useEventStore((s) => {
    if (!currentServer || s.loadedServerId !== currentServer.id) return null
    const now = Date.now()
    return s.events.find((e) => e.status === 'active' || new Date(e.endAt ?? e.startAt).getTime() >= now) ?? null
  })
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
        serverId: member?.serverId,
        username: p.username,
        displayName: member?.user.displayName,
        avatarUrl: member?.user.avatarUrl,
        bio: member?.user.bio ?? null,
        isBot: member?.user.isBot,
        status: resolvedStatus,
        customStatus: member?.user.customStatus ?? null,
        joinedAt: member?.joinedAt,
        roleName: (() => {
          const r = member?.roles?.filter((r) => !r.isDefault)
          return r && r.length > 0 ? r.reduce((a, b) => (a.position > b.position ? a : b)).name : null
        })(),
        roleColor: member ? getRoleColor(member) : null
      })
      setVoiceCardRect(rect)
    },
    [user?.id, members, onlineUserIds]
  )

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

  const serverMenuItems = useServerMenuItems(
    {
      settings: canManageServer ? () => setServerSettingsOpen(true) : undefined,
      createChannel: isAdminOrOwner
        ? () => {
            setCreateCategoryId(null)
            setChannelModalOpen(true)
          }
        : undefined,
      createCategory: isAdminOrOwner ? () => setCreateCategoryOpen(true) : undefined,
      reorder: isAdminOrOwner ? () => setReorderOpen(true) : undefined,
      profile: () => setProfileOpen(true),
      read: () => {
        if (currentServer) void ackServer(currentServer.id)
      },
      notifications: () => setServerNotifOpen(true),
      invite: () => setInviteOpen(true),
      events: () => setEventsOpen(true),
      roles: () => setRolePickerOpen(true),
      leaderboard: currentServer?.xpEnabled ? () => setLeaderboardOpen(true) : undefined,
      leave: !isOwner ? () => setShowLeaveConfirm(true) : undefined
    },
    eventCount
  )

  return (
    <>
      <aside className="relative flex h-full shrink-0 flex-col bg-surface-dark" style={{ width: sidebarWidth }}>
        {/* Drag handle */}
        <PanelResizeHandle
          label={t('resizeChannelSidebar')}
          value={sidebarWidth}
          min={200}
          max={320}
          edge="right"
          onChange={setSidebarWidth}
          onReset={() => setSidebarWidth(256)}
        />

        <ContextMenu
          label={currentServer?.name ?? t('servers')}
          items={serverMenuItems}
          disabled={!currentServer}
          openOnClick
        >
          <button
            type="button"
            className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/20 px-3 shadow-sm transition hover:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-white">
              {currentServer?.name ?? t('servers')}
            </span>
            <ChevronDownIcon collapsed={false} />
          </button>
        </ContextMenu>

        {leaveError && (
          <div className="mx-2 mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">{leaveError}</div>
        )}

        <ContextMenu label={currentServer?.name ?? t('channels')} items={serverMenuItems} disabled={!currentServer}>
          <div className="flex min-h-0 flex-1 flex-col">
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
                  onClick={() => {
                    setEventsInitialId(null)
                    setEventsOpen(true)
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
                >
                  <svg
                    className="h-4 w-4 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {t('events')}
                  <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {eventCount}
                  </span>
                </button>
              )}

              {currentServer && nextEvent && (
                <button
                  type="button"
                  onClick={() => {
                    setEventsInitialId(nextEvent.id)
                    setEventsOpen(true)
                  }}
                  className="-mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1 pl-7 text-left text-xs text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
                >
                  {nextEvent.status === 'active' ? (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-500" />
                  )}
                  <span className="truncate">{nextEvent.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-gray-500">
                    {nextEvent.status === 'active'
                      ? tEvents('schedule.live')
                      : formatEventSchedule(nextEvent.startAt, nextEvent.endAt, nextEvent.status, tEvents)}
                  </span>
                </button>
              )}

              {/* Uncategorized text channels */}
              {(uncategorizedText.length > 0 || categoryGroups.length === 0) && (
                <>
                  <ContextMenu label={t('sectionTextChannels')} items={serverMenuItems}>
                    <button type="button" className="flex w-full px-2 pt-1 text-left">
                      <SectionHeading as="span">{t('sectionTextChannels').toUpperCase()}</SectionHeading>
                    </button>
                  </ContextMenu>
                  <ul className="space-y-0.5">
                    {uncategorizedText.map((ch) => (
                      <TextChannelItem
                        key={ch.id}
                        ch={ch}
                        active={ch.id === currentChannelId && !viewingVoiceRoom}
                        readState={channelReadStates.get(ch.id)}
                        notifLevel={getNotifLevel(ch.id)}
                        canManage={isAdminOrOwner}
                        onEditChannel={setEditingChannel}
                        onOpenPinned={handleOpenPinned}
                        currentServer={currentServer}
                        orchestratedGoToChannel={orchestratedGoToChannel}
                      />
                    ))}
                  </ul>
                </>
              )}

              {/* Category groups */}
              {categoryGroups.map((group) => {
                const isCollapsed = collapsedCategoryIds.includes(group.category.id)
                const hasChannels =
                  group.textChannels.length > 0 || group.voiceChannels.length > 0 || group.forumChannels.length > 0
                return (
                  <div key={group.category.id} className="mt-1">
                    <div className="group/header flex items-center justify-between px-1 pt-1">
                      <CategoryContextMenu
                        category={group.category}
                        canManage={isAdminOrOwner}
                        onCreate={() => {
                          setCreateCategoryId(group.category.id)
                          setChannelModalOpen(true)
                        }}
                        onEdit={() => setEditingCategory(group.category)}
                      >
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
                      </CategoryContextMenu>
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
                                readState={channelReadStates.get(ch.id)}
                                notifLevel={getNotifLevel(ch.id)}
                                canManage={isAdminOrOwner}
                                onEditChannel={setEditingChannel}
                                onOpenPinned={handleOpenPinned}
                                currentServer={currentServer}
                                orchestratedGoToChannel={orchestratedGoToChannel}
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
                                speakingUsers={speakingUsers}
                                members={members}
                                handleVoiceChannelClick={handleVoiceChannelClick}
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
                                readState={channelReadStates.get(ch.id)}
                                notifLevel={getNotifLevel(ch.id)}
                                canManage={isAdminOrOwner}
                                onEditChannel={setEditingChannel}
                                onOpenPinned={handleOpenPinned}
                                currentServer={currentServer}
                                orchestratedGoToChannel={orchestratedGoToChannel}
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
                  <ContextMenu label={t('sectionVoiceChannels')} items={serverMenuItems}>
                    <button type="button" className="flex w-full px-2 pt-1 text-left">
                      <SectionHeading as="span">{t('sectionVoiceChannels').toUpperCase()}</SectionHeading>
                    </button>
                  </ContextMenu>
                  <ul className="space-y-1">
                    {uncategorizedVoice.map((ch) => (
                      <VoiceChannelItem
                        key={ch.id}
                        ch={ch}
                        voiceParticipants={voiceParticipants}
                        currentVoiceChannelId={currentVoiceChannelId}
                        viewingVoiceRoom={viewingVoiceRoom}
                        isAdminOrOwner={isAdminOrOwner}
                        speakingUsers={speakingUsers}
                        members={members}
                        handleVoiceChannelClick={handleVoiceChannelClick}
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
                  <ContextMenu label={t('sectionForumChannels')} items={serverMenuItems}>
                    <button type="button" className="flex w-full px-2 pt-1 text-left">
                      <SectionHeading as="span">{t('sectionForumChannels').toUpperCase()}</SectionHeading>
                    </button>
                  </ContextMenu>
                  <ul className="space-y-0.5">
                    {uncategorizedForum.map((ch) => (
                      <ForumChannelItem
                        key={ch.id}
                        ch={ch}
                        active={ch.id === currentChannelId && !viewingVoiceRoom}
                        readState={channelReadStates.get(ch.id)}
                        notifLevel={getNotifLevel(ch.id)}
                        canManage={isAdminOrOwner}
                        onEditChannel={setEditingChannel}
                        onOpenPinned={handleOpenPinned}
                        currentServer={currentServer}
                        orchestratedGoToChannel={orchestratedGoToChannel}
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
                      {t('sectionArchived', { count: archivedChannels.length }).toUpperCase()}
                    </span>
                  </button>
                  {showArchived && (
                    <ul className="mt-0.5 space-y-0.5">
                      {archivedChannels.map((ch) => (
                        <TextChannelItem
                          key={ch.id}
                          ch={ch}
                          active={ch.id === currentChannelId && !viewingVoiceRoom}
                          readState={channelReadStates.get(ch.id)}
                          notifLevel={getNotifLevel(ch.id)}
                          canManage={isAdminOrOwner}
                          onEditChannel={setEditingChannel}
                          onOpenPinned={handleOpenPinned}
                          currentServer={currentServer}
                          orchestratedGoToChannel={orchestratedGoToChannel}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </SimpleBar>
          </div>
        </ContextMenu>

        <VoicePanel />
      </aside>

      {channelModalOpen && (
        <Suspense fallback={null}>
          <CreateChannelModal
            open
            onClose={() => {
              setChannelModalOpen(false)
              setCreateCategoryId(null)
            }}
            defaultCategoryId={createCategoryId}
          />
        </Suspense>
      )}
      {inviteOpen && currentServer && (
        <Suspense fallback={null}>
          <InviteModal
            serverId={currentServer.id}
            serverName={currentServer.name}
            vanityCode={currentServer.vanityCode}
            onClose={() => setInviteOpen(false)}
          />
        </Suspense>
      )}
      {serverSettingsOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
        </Suspense>
      )}
      {profileOpen && currentServer && user && (
        <ServerProfileModal serverId={currentServer.id} userId={user.id} onClose={() => setProfileOpen(false)} />
      )}
      {leaderboardOpen && currentServer && !isTablet && currentServer.xpEnabled && (
        <Suspense fallback={null}>
          <LeaderboardModal serverId={currentServer.id} onClose={() => setLeaderboardOpen(false)} />
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
          <EventsPanel
            serverId={currentServer.id}
            initialEventId={eventsInitialId ?? undefined}
            onClose={() => {
              setEventsOpen(false)
              setEventsInitialId(null)
            }}
          />
        </Suspense>
      )}
      {serverNotifOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerNotifModal
            serverId={currentServer.id}
            serverName={currentServer.name}
            onClose={() => setServerNotifOpen(false)}
          />
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

      {rolePickerOpen && currentServer && (
        <Suspense fallback={null}>
          <RolePickerModal onClose={() => setRolePickerOpen(false)} />
        </Suspense>
      )}
      {showLeaveConfirm && currentServer && (
        <ConfirmDialog
          title={t('leaveServerTitle')}
          description={t('leaveServerDescription', { server: currentServer.name })}
          confirmLabel={t('leaveServerConfirm')}
          onConfirm={handleLeaveConfirmed}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}
    </>
  )
}
