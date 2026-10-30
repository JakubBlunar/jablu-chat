import { CategoryContextMenu, ChannelContextMenu } from '@/components/channel/ChannelContextMenu'
import { TextChannelItem } from '@/components/channel/channel-sidebar/TextChannelItem'
import { VoiceParticipantRow } from '@/components/channel/channel-sidebar/VoiceComponents'
import { DraftBadge } from '@/components/chat/DraftBadge'
import { ConversationPreview } from '@/components/dm/ConversationPreview'
import { GroupDmModal } from '@/components/dm/GroupDmModal'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import { UserFooter } from '@/components/layout/UserFooter'
import { MobileNavServerRail } from '@/components/layout/mobile-nav/MobileNavServerRail'
import { useServerDialogs } from '@/components/server/hooks/useServerDialogs'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { useServerMenuItems } from '@/hooks/useServerMenuItems'
import { useVisibleChannelGroups } from '@/hooks/useVisibleChannelGroups'
import { showToast } from '@/stores/toast.store'
import type { Channel } from '@chat/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { PlusSmallIcon, SpeakerIcon } from './mobile-nav/mobileNavIcons'

import { UserAvatar } from '@/components/UserAvatar'
import { ForumChannelItem } from '@/components/channel/channel-sidebar/ForumChannelItem'
import { CountBadge, IconButton } from '@/components/ui'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { VoicePanel } from '@/components/voice/LazyVoicePanel'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { Permission, usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { computeServerBadges } from '@/lib/unread'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useEventStore } from '@/stores/event.store'
import { useFriendStore } from '@/stores/friend.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useMemberStore } from '@/stores/member.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useReadStateStore } from '@/stores/readState.store'
import { type Server, useServerStore } from '@/stores/server.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'
import { useShallow } from 'zustand/react/shallow'

export function MobileNavDrawer({
  onOpenSettings,
  onOpenQuickSwitcher
}: {
  onOpenSettings: (tab?: string) => void
  onOpenQuickSwitcher: () => void
}) {
  const {
    setChannelModalOpen,
    setEditingChannel,
    setInviteOpen,
    setServerSettingsOpen,
    setProfileOpen,
    setLeaderboardOpen,
    setReorderOpen,
    setEventsOpen,
    setServerNotifOpen,
    setCreateCategoryId,
    setCreateCategoryOpen,
    setEditingCategory,
    setRolePickerOpen
  } = useServerDialogs()

  const { t: tChannels } = useTranslation('channels')
  const { t } = useTranslation('nav')
  const { t: tChat } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const { open, close } = useLayoutStore(useShallow((s) => ({ open: s.navDrawerOpen, close: s.closeNavDrawer })))

  const { goToChannel, goToDms, goToFriends, goToDm } = useAppNavigate()

  const {
    viewMode,
    servers,
    currentServerId,
    removeServer,
    isLoading: serversLoading
  } = useServerStore(
    useShallow((s) => ({
      viewMode: s.viewMode,
      servers: s.servers,
      currentServerId: s.currentServerId,
      removeServer: s.removeServer,
      isLoading: s.isLoading
    }))
  )

  const navigatingToServerId = useNavigationStore((s) => s.navigatingToServerId)

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
      void goToChannel(voiceServerId, currentVoiceChannelId)
      close()
    }
  }, [voiceServerId, currentVoiceChannelId, goToChannel, close])

  const [groupDmOpen, setGroupDmOpen] = useState(false)

  const [dmFilter, setDmFilter] = useState('')
  const { has: hasPerm } = usePermissions(currentServerId)
  const isAdminOrOwner = hasPerm(Permission.MANAGE_CHANNELS)

  const handleOpenPinned = useCallback(
    (channel: Channel) => {
      if (!currentServerId) return
      void goToChannel(currentServerId, channel.id)
      useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
      close()
      setTimeout(() => window.dispatchEvent(new CustomEvent('open-pinned')), 100)
    },
    [currentServerId, goToChannel, close]
  )

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
  const openLeaderboard = useCallback(() => {
    close()
    setLeaderboardOpen(true)
  }, [close, setLeaderboardOpen])

  useEffect(() => {
    if (viewMode !== 'server' || !currentServer?.xpEnabled) return
    window.addEventListener('open-leaderboard', openLeaderboard)
    return () => window.removeEventListener('open-leaderboard', openLeaderboard)
  }, [viewMode, currentServer?.xpEnabled, openLeaderboard])

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

  const serverBadges = useMemo(
    () => computeServerBadges(channelReadStates, channelToServer, getEffective),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEffective, channelReadStates, channelToServer, notifPrefs, serverPrefs]
  )

  const getNotifLevel = useCallback(
    (channelId: string) => getEffective(channelId, currentServer?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifPrefs, serverPrefs, currentServer?.id, getEffective]
  )

  const { uncategorizedText, uncategorizedVoice, uncategorizedForum, categoryGroups } = useVisibleChannelGroups(
    channels,
    storeCategories
  )

  const handleServerClick = useCallback(
    (server: Server) => {
      void goToChannel(server.id)
    },
    [goToChannel]
  )

  const handleDmClick = useCallback(() => {
    goToDms()
  }, [goToDms])

  const handleChannelClick = useCallback(
    async (ch: Channel) => {
      if (currentServerId) await goToChannel(currentServerId, ch.id)
      useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
      close()
    },
    [currentServerId, goToChannel, close]
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
          avatarUrl: conv.groupAvatarUrl ?? null,
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

  const serverMenuItems = useServerMenuItems(
    {
      settings:
        hasPerm(Permission.MANAGE_SERVER) || isOwner
          ? () => {
              close()
              setServerSettingsOpen(true)
            }
          : undefined,
      createChannel: isAdminOrOwner
        ? () => {
            setCreateCategoryId(null)
            close()
            setChannelModalOpen(true)
          }
        : undefined,
      createCategory: isAdminOrOwner
        ? () => {
            close()
            setCreateCategoryOpen(true)
          }
        : undefined,
      reorder: isAdminOrOwner
        ? () => {
            close()
            setReorderOpen(true)
          }
        : undefined,
      profile: () => {
        close()
        setProfileOpen(true)
      },
      read: () => {
        if (currentServer) void useReadStateStore.getState().ackServer(currentServer.id)
      },
      notifications: () => {
        close()
        setServerNotifOpen(true)
      },
      invite: () => {
        close()
        setInviteOpen(true)
      },
      events: () => {
        close()
        setEventsOpen(true)
      },
      roles: () => {
        close()
        setRolePickerOpen(true)
      },
      leaderboard: currentServer?.xpEnabled ? openLeaderboard : undefined,
      leave: !isOwner
        ? () => {
            void handleLeave()
          }
        : undefined
    },
    eventCount
  )

  return (
    <>
      <MobileDrawer open={open} onClose={close} side="left" width="w-[min(100vw,28rem)]">
        <div
          className="flex h-full min-h-0 flex-col bg-surface-dark [&_button]:min-h-11"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
            <span className="text-sm font-semibold text-white">{t('mobileChats')}</span>
            <button
              type="button"
              onClick={close}
              aria-label={tCommon('close')}
              className="flex h-11 w-11 items-center justify-center rounded text-gray-400 hover:bg-white/10"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="m6 6 12 12M6 18 18 6" />
              </svg>
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-row">
            <MobileNavServerRail
              viewMode={viewMode}
              servers={servers}
              currentServerId={currentServerId}
              isLoading={serversLoading}
              hasDmUnread={hasDmUnread}
              navigatingToServerId={navigatingToServerId}
              serverBadges={serverBadges}
              onDmClick={handleDmClick}
              onServerClick={handleServerClick}
              onOpenQuickSwitcher={() => {
                close()
                onOpenQuickSwitcher()
              }}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-dark">
              {/* Server name + dropdown trigger */}
              {viewMode === 'server' && currentServer && (
                <ContextMenu label={currentServer.name} items={serverMenuItems} openOnClick>
                  <button
                    type="button"
                    className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/20 px-3 transition active:bg-white/[0.06]"
                  >
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-white">
                      {currentServer.name}
                    </span>
                    <svg
                      className="h-4 w-4 shrink-0 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </ContextMenu>
              )}

              {/* Channel / DM list */}
              <ContextMenu
                label={currentServer?.name ?? t('channels')}
                items={serverMenuItems}
                disabled={viewMode !== 'server' || !currentServer}
              >
                <div className="flex min-h-0 flex-1 flex-col">
                  <SimpleBar className="min-h-0 flex-1 px-2 py-2">
                    {viewMode === 'server' ? (
                      <>
                        {/* Uncategorized text channels */}
                        {(uncategorizedText.length > 0 || categoryGroups.length === 0) && (
                          <>
                            <div className="mb-1 flex items-center justify-between px-2">
                              <SectionHeading as="span">
                                {tChannels('sidebar.textChannels').toUpperCase()}
                              </SectionHeading>
                              {isAdminOrOwner && (
                                <IconButton
                                  label={tChannels('sidebar.createChannel')}
                                  size="sm"
                                  onClick={() => {
                                    close()
                                    setCreateCategoryId(null)
                                    setChannelModalOpen(true)
                                  }}
                                  className="p-0.5"
                                >
                                  <PlusSmallIcon />
                                </IconButton>
                              )}
                            </div>
                            <ul className="space-y-0.5">
                              {uncategorizedText.map((ch) => (
                                <TextChannelItem
                                  key={ch.id}
                                  ch={ch}
                                  active={ch.id === currentChannelId && !viewingVoiceRoom}
                                  readState={channelReadStates.get(ch.id)}
                                  notifLevel={getNotifLevel(ch.id)}
                                  canManage={isAdminOrOwner}
                                  onEditChannel={(channel) => {
                                    close()
                                    setEditingChannel(channel)
                                  }}
                                  onOpenPinned={handleOpenPinned}
                                  currentServer={currentServer}
                                  goToChannel={async () => {
                                    await handleChannelClick(ch)
                                  }}
                                />
                              ))}
                            </ul>
                          </>
                        )}

                        {/* Category groups */}
                        {categoryGroups.map((group) => {
                          const isCollapsed = collapsedCategoryIds.includes(group.category.id)
                          return (
                            <div key={group.category.id} className="mt-2">
                              <CategoryContextMenu
                                category={group.category}
                                canManage={isAdminOrOwner}
                                onCreate={() => {
                                  setCreateCategoryId(group.category.id)
                                  close()
                                  setChannelModalOpen(true)
                                }}
                                onEdit={() => {
                                  close()
                                  setEditingCategory(group.category)
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleCollapsedCategory(group.category.id)}
                                  className="mb-1 flex w-full items-center gap-1 px-2 text-left"
                                >
                                  <svg
                                    className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
                                  </svg>
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                    {group.category.name}
                                  </span>
                                </button>
                              </CategoryContextMenu>
                              {!isCollapsed && (
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
                                          onEditChannel={(channel) => {
                                            close()
                                            setEditingChannel(channel)
                                          }}
                                          onOpenPinned={handleOpenPinned}
                                          currentServer={currentServer}
                                          goToChannel={async () => {
                                            await handleChannelClick(ch)
                                          }}
                                        />
                                      ))}
                                    </ul>
                                  )}
                                  {group.voiceChannels.length > 0 && (
                                    <ul className="space-y-0.5">
                                      {group.voiceChannels.map((ch) => {
                                        const participants = voiceParticipants[ch.id] ?? []
                                        const inThis = currentVoiceChannelId === ch.id
                                        return (
                                          <li key={ch.id}>
                                            <ChannelContextMenu
                                              channel={ch}
                                              canManage={isAdminOrOwner}
                                              onEdit={() => {
                                                close()
                                                setEditingChannel(ch)
                                              }}
                                              onOpenPinned={() => handleOpenPinned(ch)}
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  handleVoiceChannelClick(ch)
                                                }}
                                                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${inThis ? 'text-white' : 'text-gray-300 hover:bg-white/[0.06]'}`}
                                              >
                                                <SpeakerIcon />
                                                <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                                                {participants.length > 0 && (
                                                  <span className="text-xs text-gray-400">{participants.length}</span>
                                                )}
                                              </button>
                                            </ChannelContextMenu>
                                            <ul className="ml-4 space-y-0.5">
                                              {participants.map((p) => (
                                                <VoiceParticipantRow
                                                  key={p.userId}
                                                  participant={p}
                                                  channelId={ch.id}
                                                  member={members.find((m) => m.userId === p.userId)}
                                                  isSpeaking={false}
                                                />
                                              ))}
                                            </ul>
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
                                          readState={channelReadStates.get(ch.id)}
                                          notifLevel={getNotifLevel(ch.id)}
                                          canManage={isAdminOrOwner}
                                          onEditChannel={(channel) => {
                                            close()
                                            setEditingChannel(channel)
                                          }}
                                          onOpenPinned={handleOpenPinned}
                                          currentServer={currentServer}
                                          goToChannel={goToChannel}
                                          onSelect={close}
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
                              <SectionHeading as="span">
                                {tChannels('sidebar.voiceChannels').toUpperCase()}
                              </SectionHeading>
                              {isAdminOrOwner && (
                                <IconButton
                                  label={tChannels('sidebar.createChannel')}
                                  size="sm"
                                  onClick={() => {
                                    close()
                                    setCreateCategoryId(null)
                                    setChannelModalOpen(true)
                                  }}
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
                                    <ChannelContextMenu
                                      channel={ch}
                                      canManage={isAdminOrOwner}
                                      onEdit={() => {
                                        close()
                                        setEditingChannel(ch)
                                      }}
                                      onOpenPinned={() => handleOpenPinned(ch)}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleVoiceChannelClick(ch)
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${inThis ? 'text-white' : 'text-gray-300 hover:bg-white/[0.06]'}`}
                                      >
                                        <SpeakerIcon />
                                        <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                                        {participants.length > 0 && (
                                          <span className="text-xs text-gray-400">{participants.length}</span>
                                        )}
                                      </button>
                                    </ChannelContextMenu>
                                    {participants.length > 0 && (
                                      <ul className="ml-4 space-y-0.5">
                                        {participants.map((p) => {
                                          const member = members.find((m) => m.userId === p.userId)
                                          return (
                                            <VoiceParticipantRow
                                              key={p.userId}
                                              participant={p}
                                              channelId={ch.id}
                                              member={member}
                                              isSpeaking={false}
                                            />
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
                              <SectionHeading as="span">
                                {tChannels('sidebar.forumChannels').toUpperCase()}
                              </SectionHeading>
                              {isAdminOrOwner && (
                                <IconButton
                                  label={tChannels('sidebar.createChannel')}
                                  size="sm"
                                  onClick={() => {
                                    close()
                                    setCreateCategoryId(null)
                                    setChannelModalOpen(true)
                                  }}
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
                                  readState={channelReadStates.get(ch.id)}
                                  notifLevel={getNotifLevel(ch.id)}
                                  canManage={isAdminOrOwner}
                                  onEditChannel={(channel) => {
                                    close()
                                    setEditingChannel(channel)
                                  }}
                                  onOpenPinned={handleOpenPinned}
                                  currentServer={currentServer}
                                  goToChannel={goToChannel}
                                  onSelect={close}
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
                          onClick={() => {
                            goToFriends()
                            close()
                          }}
                          className="mb-2 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/5 hover:text-white"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
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
                          className="mb-1 min-h-11 w-full rounded-md bg-surface-darkest px-2.5 py-1.5 text-base text-gray-200 outline-none placeholder:text-gray-500"
                        />
                        <ul className="space-y-0.5">
                          {filteredConversations.map((conv) => {
                            const info = getConvDisplayInfo(conv)
                            const active = conv.id === currentConvId
                            const rs = dmReadStates.get(conv.id)
                            const hasUnread = rs && rs.unreadCount > 0
                            return (
                              <li key={conv.id} className="group/dm relative">
                                <button
                                  type="button"
                                  onClick={() => handleConvClick(conv.id)}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 pr-12 py-2 text-left text-sm transition ${
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
                                  <span className="min-w-0 flex-1 text-left">
                                    <span className="flex items-center gap-2">
                                      <span className="min-w-0 flex-1 truncate">
                                        {conv.isFavorite ? '\u2605 ' : ''}
                                        {info.name}
                                      </span>
                                      <DraftBadge mode="dm" contextId={conv.id} />
                                    </span>
                                    <ConversationPreview conversation={conv} currentUserId={user?.id} />
                                    {conv.muted && (
                                      <span className="text-[10px] text-gray-500">{tChat('conversationMuted')}</span>
                                    )}
                                  </span>
                                  {hasUnread && !conv.muted && (
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                  )}
                                </button>
                                <IconButton
                                  label={t('closeConversation')}
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void closeConv(conv.id).catch(() =>
                                      showToast(tChat('conversationActionFailed'), tChat('conversationRetry'))
                                    )
                                  }}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 opacity-60 hover:text-white"
                                >
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
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
                </div>
              </ContextMenu>

              {/* Voice panel */}
              <VoicePanel onGoToVoiceRoom={handleGoToVoiceRoom} />
            </div>
          </div>

          {/* User footer spans the full drawer width, below the rail + list */}
          <UserFooter
            onOpenSettings={(tab) => {
              close()
              onOpenSettings(tab)
            }}
            className="px-3 py-2"
          />
        </div>
      </MobileDrawer>

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
