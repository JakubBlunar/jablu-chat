import type { Message } from '@chat/shared'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DelayedRender } from '@/components/DelayedRender'
import { ProfileCard } from '@/components/ProfileCard'
import { MessageSurface } from '@/components/chat/MessageSurface'
import { UnifiedInput } from '@/components/chat/UnifiedInput'
import { PollCreator } from '@/components/chat/PollCreator'
import { PinnedPanel } from '@/components/chat/PinnedPanel'
import { SavedMessagesPanel } from '@/components/chat/SavedMessagesPanel'
import { ThreadPanel } from '@/components/chat/ThreadPanel'
import { DmProfilePanel, UserProfileIcon } from '@/components/dm/DmProfilePanel'
import { FriendsPage } from '@/components/dm/FriendsPage'
import { useIsMobile } from '@/hooks/useMobile'
import { useMessageStoreAdapter } from '@/hooks/useMessageStoreAdapter'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useMemberStore } from '@/stores/member.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { Permission as SharedPermission, hasPermission as hasPermFlag } from '@chat/shared'
import { useDmStore } from '@/stores/dm.store'
import { useGifStore } from '@/stores/gif.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { useThreadStore } from '@/stores/thread.store'

import { useMessageScroll } from '@/components/chat/hooks/useMessageScroll'
import { useProfileCard } from '@/components/chat/hooks/useProfileCard'
import { usePinnedMessages } from '@/components/chat/hooks/usePinnedMessages'
import { useTypingIndicators, formatTyping } from '@/components/chat/hooks/useTypingIndicators'
import { useReadReceipts } from '@/components/chat/hooks/useReadReceipts'
import { useDmContext, dmMentionChannels } from '@/components/dm/hooks/useDmContext'

import { NotifBellMenu } from '@/components/channel/NotifBellMenu'
import { InAppNotificationBell } from '@/components/notifications/InAppNotificationBell'
import { SearchBar } from '@/components/SearchBar'
const SearchDrawer = lazy(() => import('@/components/search/SearchDrawer').then((m) => ({ default: m.SearchDrawer })))
const EditChannelModal = lazy(() =>
  import('@/components/channel/EditChannelModal').then((m) => ({ default: m.EditChannelModal }))
)
import { ChannelInfoPanel } from '@/components/chat/ChannelInfoPanel'
import { DmInfoSheet } from '@/components/dm/DmInfoSheet'
import { CountBadge, IconButton, Spinner } from '@/components/ui'
import {
  AtIcon,
  BookmarkIcon,
  HamburgerIcon,
  HashChannelIcon,
  MembersIcon,
  PinnedListIcon,
  SettingsCogIcon,
} from '@/components/chat/chatIcons'

/* ── MessageArea ── */

export interface MessageAreaProps {
  mode: 'channel' | 'dm'
  contextId: string | null
  memberSidebar?: React.ReactNode
}

export function MessageArea({ mode, contextId, memberSidebar }: MessageAreaProps) {
  const { t: tA11y } = useTranslation('a11y')
  const { t: tChat } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const isMobile = useIsMobile()
  const threadOpen = useThreadStore((s) => s.isOpen)
  const isDm = mode === 'dm'
  const store = useMessageStoreAdapter(mode)
  const { messages, isLoading, hasMore, hasNewer } = store
  const dmMessagesError = useDmStore((s) => s.messagesError)
  const channelMessagesError = useMessageStore((s) => s.messagesError)
  const messagesError = isDm ? dmMessagesError : channelMessagesError

  const userId = useAuthStore((s) => s.user?.id)

  const scroll = useMessageScroll(contextId, store)
  const dm = useDmContext(isDm, userId)
  const { cardUser, cardRect, closeCard, handleUserClick, handleMentionClick } = useProfileCard(isDm, dm.currentConv)
  const typingNames = useTypingIndicators(isDm, contextId, userId)
  const { lastOwnMsg, seenByLabel } = useReadReceipts(isDm, contextId, dm.currentConv, userId, messages)

  const channelId = isDm ? null : contextId
  const dmConversationId = isDm ? contextId : null
  const pinned = usePinnedMessages(channelId, dmConversationId)

  const currentServerId = useServerStore((s) => s.currentServerId)
  const channelServer = useServerStore((s) =>
    s.currentServerId ? s.servers.find((sv) => sv.id === s.currentServerId) ?? null : null
  )
  const activeChannel = useChannelStore((s) => {
    if (isDm || !s.currentChannelId) return null
    const ch = s.channels.find((c) => c.id === s.currentChannelId)
    if (!ch || ch.serverId !== currentServerId) return null
    return ch
  })

  const [editingChannel, setEditingChannel] = useState(false)
  const { has: hasPerm } = usePermissions(isDm ? null : currentServerId)
  const isAdminOrOwner = hasPerm(Permission.MANAGE_SERVER)

  type MemberMap = Map<string, ReturnType<typeof useMemberStore.getState>['members'][0]>
  const membersByUsernameRef = useRef<MemberMap>(new Map())
  useEffect(() => {
    const build = (members: ReturnType<typeof useMemberStore.getState>['members']) => {
      const map: MemberMap = new Map()
      for (const m of members) map.set(m.user.username.toLowerCase(), m)
      return map
    }
    membersByUsernameRef.current = build(useMemberStore.getState().members)
    return useMemberStore.subscribe((s) => {
      membersByUsernameRef.current = build(s.members)
    })
  }, [])

  const channelPerms = useChannelPermissionsStore(
    (s) => contextId ? s.permissionsMap[contextId] ?? null : null
  )
  const canSend = isDm || channelPerms === null
    ? true
    : hasPermFlag(channelPerms, SharedPermission.SEND_MESSAGES)

  const myId = useAuthStore((s) => s.user?.id)
  const myMember = useMemberStore((s) =>
    s.members.find((m) => m.userId === myId && m.serverId === currentServerId)
  )
  const isMuted = !isDm && myMember?.mutedUntil
    ? new Date(myMember.mutedUntil) > new Date()
    : false

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [commandToast, setCommandToast] = useState<string | null>(null)
  const [savedOpen, setSavedOpen] = useState(false)
  const [channelInfoOpen, setChannelInfoOpen] = useState(false)
  const [dmSheetOpen, setDmSheetOpen] = useState(false)

  const [replyTarget, setReplyTarget] = useState<{
    id: string
    content: string | null
    authorName: string
  } | null>(null)

  useEffect(() => {
    setReplyTarget(null)
  }, [contextId])

  useEffect(() => {
    setChannelInfoOpen(false)
  }, [contextId])

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? tChat('deletedUser')
    })
  }, [tChat])

  const gifEnabled = useGifStore((s) => s.enabled)

  const channelRefsRef = useRef(dm.channelRefs)
  channelRefsRef.current = dm.channelRefs

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])
  const scheduleToastDismiss = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setCommandToast(null), 3000)
  }, [])

  const handleNick = useCallback(async (args?: string) => {
    const name = args?.trim()
    if (!name) {
      setCommandToast(tChat('commandNickUsage'))
      scheduleToastDismiss()
      return
    }
    if (name.length < 5 || name.length > 20) {
      setCommandToast(tChat('commandNickLength'))
      scheduleToastDismiss()
      return
    }
    try {
      const updated = await api.updateProfile({ displayName: name })
      useAuthStore.getState().setUser(updated)
      useMemberStore.getState().updateUserProfile(updated.id, { displayName: updated.displayName })
      setCommandToast(tChat('commandNickSuccess', { name }))
    } catch {
      setCommandToast(tChat('commandNickFailed'))
    }
    scheduleToastDismiss()
  }, [scheduleToastDismiss, tChat])

  /* ── Empty states ── */
  if (!contextId) {
    if (isDm) {
      return <FriendsPage />
    }
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm md:px-4">
          {isMobile && (
            <button
              type="button"
              aria-label={tA11y('openNavigationMenu')}
              onClick={useLayoutStore.getState().openNavDrawer}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <HamburgerIcon />
            </button>
          )}
          <h1 className="text-base font-semibold text-gray-400">{tChat('selectChannel')}</h1>
        </header>
        <div className="flex min-h-0 flex-1" />
      </section>
    )
  }

  /* ── Scroll content ── */
  const emptyState = !isDm && !activeChannel ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-full bg-surface-dark p-6 text-gray-400">
        <HashChannelIcon />
      </div>
      <p className="max-w-sm text-lg font-semibold text-white">{tChat('welcomeServerTitle')}</p>
      <p className="max-w-sm text-sm text-gray-400">
        {isMobile ? tChat('welcomeServerHintMobile') : tChat('welcomeServerHintDesktop')}
      </p>
    </div>
  ) : isLoading && messages.length === 0 ? (
    <DelayedRender loading delay={500} fallback={<div className="flex-1" />}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">{tChat('loadingMessages')}</p>
      </div>
    </DelayedRender>
  ) : messagesError && messages.length === 0 ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
      <p className="text-sm text-red-400">{messagesError}</p>
      <button
        type="button"
        onClick={() => contextId && store.fetchMessages(contextId)}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-text transition hover:bg-primary/80"
      >
        {tCommon('retry')}
      </button>
    </div>
  ) : !isDm && activeChannel && messages.length === 0 ? (
    <div className="flex flex-1 flex-col justify-end pb-6">
      <div className="border-t border-white/10 pt-4">
        <h2 className="text-2xl font-bold text-white">
          {tChat('channelBeginningLead')}{' '}
          <span className="text-primary">#{activeChannel.name}</span>
        </h2>
        <p className="mt-2 text-[15px] text-gray-400">{tChat('sparkConversation')}</p>
      </div>
    </div>
  ) : isDm && messages.length === 0 ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12">
      <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <h3 className="text-sm font-medium text-gray-400">{tChat('noMessagesYet')}</h3>
      <p className="text-xs text-gray-500">{tChat('sayHello')}</p>
    </div>
  ) : null

  const messageList = (
    <>
      {pinned.pinnedOpen && (channelId || dmConversationId) && (
        <PinnedPanel
          messages={pinned.pinnedMessages}
          loading={pinned.pinnedLoading}
          onClose={() => pinned.setPinnedOpen(false)}
          canUnpin={isDm || isAdminOrOwner}
          channelId={channelId ?? undefined}
          conversationId={dmConversationId ?? undefined}
          onJump={scroll.handleJumpToMessage}
        />
      )}
      {savedOpen && (
        <SavedMessagesPanel
          onClose={() => setSavedOpen(false)}
          onJump={(messageId, opts) => {
            setSavedOpen(false)
            if (opts.conversationId) {
              void useNavigationStore.getState().navigateToDm({
                conversationId: opts.conversationId,
                scrollToMessageId: messageId
              })
            } else if (opts.serverId && opts.channelId) {
              void useNavigationStore.getState().navigateToChannel({
                serverId: opts.serverId,
                channelId: opts.channelId,
                scrollToMessageId: messageId
              })
            }
          }}
        />
      )}

      <MessageSurface
        scroll={scroll}
        messages={messages}
        isLoading={isLoading}
        hasMore={hasMore}
        hasNewer={hasNewer}
        mode={mode}
        contextId={contextId}
        emptyState={emptyState}
        lastOwnMsgId={lastOwnMsg?.id}
        seenByLabel={seenByLabel}
        onReply={handleReply}
        onUserClick={handleUserClick}
        onMentionClick={isDm ? undefined : handleMentionClick}
        channels={channelRefsRef.current}
        onChannelClick={dm.handleChannelClick}
        membersByUsername={membersByUsernameRef.current}
      />

      <div aria-live="polite" aria-atomic="true" className="px-4 py-1 text-xs text-gray-400">
        {typingNames.length > 0 ? formatTyping(typingNames) : null}
      </div>

      {activeChannel?.isArchived ? (
        <div className="shrink-0 border-t border-black/20 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-dark px-4 py-2.5 text-sm text-gray-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="2" y="3" width="20" height="5" rx="1" />
              <path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            This channel is archived. You can read messages but cannot send new ones.
          </div>
        </div>
      ) : isMuted ? (
        <div className="shrink-0 border-t border-black/20 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            You are timed out in this server and cannot send messages.
          </div>
        </div>
      ) : !isDm && !canSend ? (
        <div className="shrink-0 border-t border-black/20 bg-surface px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-surface-dark px-4 py-2.5 text-sm text-gray-400">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            You do not have permission to send messages in this channel.
          </div>
        </div>
      ) : (
        <>
          {!isDm && showPollCreator && contextId && (
            <div className="px-4 pb-2">
              <PollCreator channelId={contextId} onClose={() => setShowPollCreator(false)} />
            </div>
          )}

          <UnifiedInput
            mode={mode}
            contextId={contextId}
            replyTarget={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            onSent={scroll.stickToBottom}
            channels={isDm ? dmMentionChannels(dm.mutualServers) : undefined}
            gifEnabled={gifEnabled}
            placeholder={
              isDm
                ? `Message ${dm.otherMember?.displayName ?? dm.otherMember?.username ?? ''}`
                : activeChannel
                  ? replyTarget
                    ? `Reply to ${replyTarget.authorName}...`
                    : `Message #${activeChannel.name}`
                  : 'Message'
            }
            onCommand={(cmd, args) => {
              if (!isDm && cmd === 'poll') { setShowPollCreator(true); return true }
              if (!isDm && cmd === 'nick') { handleNick(args); return true }
              return false
            }}
          />
        </>
      )}

      {cardUser && <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />}
      {commandToast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-50 flex justify-center">
          <div className="pointer-events-auto rounded-lg bg-surface-darkest px-4 py-2 text-sm text-gray-200 shadow-lg ring-1 ring-white/10">
            {commandToast}
          </div>
        </div>
      )}
    </>
  )

  const channelHeader = !isDm ? (
    <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm md:px-4">
      {activeChannel ? (
        <>
          {isMobile ? (
            <button
              type="button"
              aria-label={tA11y('openNavigationMenu')}
              onClick={useLayoutStore.getState().openNavDrawer}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <HamburgerIcon />
            </button>
          ) : (
            <HashChannelIcon />
          )}
          {isMobile ? (
            <button
              type="button"
              onClick={() => setChannelInfoOpen(true)}
              className="min-w-0 flex-1 text-left"
            >
              <h1 className="truncate text-base font-semibold text-white">{activeChannel.name}</h1>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-white">{activeChannel.name}</h1>
            </div>
          )}
          {isMobile && <InAppNotificationBell className="shrink-0" />}
          {!isMobile && (
            <>
              <IconButton
                label="Pinned messages"
                size="lg"
                className="relative"
                onClick={() => void pinned.handleOpenPinned()}
              >
                <PinnedListIcon />
                <CountBadge
                  count={activeChannel.pinnedCount ?? 0}
                  variant="primary"
                  className="absolute -right-0.5 -top-0.5"
                />
              </IconButton>
              <IconButton
                label="Saved messages"
                size="lg"
                active={savedOpen}
                onClick={() => setSavedOpen((v) => !v)}
              >
                <BookmarkIcon className="h-5 w-5" />
              </IconButton>
              <InAppNotificationBell className="shrink-0" />
              <NotifBellMenu channelId={activeChannel.id} serverId={activeChannel.serverId} />
              {isAdminOrOwner && (
                <IconButton
                  label="Channel settings"
                  size="lg"
                  onClick={() => setEditingChannel(true)}
                >
                  <SettingsCogIcon />
                </IconButton>
              )}
              <IconButton
                label="Toggle member list"
                size="lg"
                onClick={() => useSettingsStore.getState().toggleMemberSidebarVisible()}
              >
                <MembersIcon />
              </IconButton>
              <SearchBar
                searchOpen={searchOpen}
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onSearch={(q) => {
                  setSearchQuery(q)
                  setSearchOpen(true)
                }}
                onClose={() => {
                  setSearchOpen(false)
                  setSearchQuery('')
                }}
              />
            </>
          )}
        </>
      ) : (
        <h1 className="text-base font-semibold text-gray-400">{tChat('selectChannel')}</h1>
      )}
    </header>
  ) : null

  if (isDm) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 bg-surface">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm md:px-4">
            {isMobile ? (
              <button
                type="button"
                aria-label={tA11y('openNavigationMenu')}
                onClick={useLayoutStore.getState().openNavDrawer}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
              >
                <HamburgerIcon />
              </button>
            ) : (
              <AtIcon />
            )}
            {isMobile ? (
              <button
                type="button"
                onClick={() => setDmSheetOpen(true)}
                className="min-w-0 flex-1 text-left"
              >
                <h2 className="truncate text-[15px] font-semibold text-white">{dm.otherName}</h2>
              </button>
            ) : (
              <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-white">{dm.otherName}</h2>
            )}
            {isMobile && <InAppNotificationBell className="shrink-0" />}
            {!isMobile && (
              <>
                {dm.otherMember && !dm.currentConv?.isGroup && (
                  <IconButton
                    label="User profile"
                    className="shrink-0"
                    active={dm.showProfile}
                    onClick={() => dm.setShowProfile((p) => !p)}
                  >
                    <UserProfileIcon />
                  </IconButton>
                )}
                <IconButton
                  label="Pinned messages"
                  className="shrink-0"
                  active={pinned.pinnedOpen}
                  onClick={() => void pinned.handleOpenPinned()}
                >
                  <PinnedListIcon />
                </IconButton>
                <IconButton
                  label="Saved messages"
                  className="shrink-0"
                  active={savedOpen}
                  onClick={() => setSavedOpen((v) => !v)}
                >
                  <BookmarkIcon className="h-5 w-5" />
                </IconButton>
                <InAppNotificationBell className="shrink-0" />
                <div className="shrink-0">
                  <SearchBar
                    searchOpen={searchOpen}
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    onSearch={(q) => {
                      setSearchQuery(q)
                      setSearchOpen(true)
                    }}
                    onClose={() => {
                      setSearchOpen(false)
                      setSearchQuery('')
                    }}
                  />
                </div>
              </>
            )}
          </header>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{messageList}</div>
        </div>
        {searchOpen ? (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <Suspense fallback={null}>
              <SearchDrawer
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onClose={() => {
                  setSearchOpen(false)
                  setSearchQuery('')
                }}
                defaultScope="conversation"
                conversationId={dm.dmConvId ?? undefined}
              />
            </Suspense>
          </div>
        ) : dm.showProfile && dm.otherMember ? (
          isMobile ? (
            <div className="absolute inset-0 z-30 bg-surface-dark">
              <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
                <button
                  type="button"
                  onClick={() => dm.setShowProfile(false)}
                  className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
                  aria-label={tChat('closeProfile')}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="ml-2 text-sm font-semibold text-white">{tChat('profileTitle')}</span>
              </div>
              <DmProfilePanel member={dm.otherMember} mutualServers={dm.mutualServers} />
            </div>
          ) : (
            <DmProfilePanel member={dm.otherMember} mutualServers={dm.mutualServers} />
          )
        ) : null}
        {dmSheetOpen && (
          <DmInfoSheet
            hasProfile={!!dm.otherMember && !dm.currentConv?.isGroup}
            onClose={() => setDmSheetOpen(false)}
            onProfile={() => { setDmSheetOpen(false); dm.setShowProfile((p) => !p) }}
            onPinned={() => { setDmSheetOpen(false); void pinned.handleOpenPinned() }}
            onSaved={() => { setDmSheetOpen(false); setSavedOpen(true) }}
            onSearch={() => { setDmSheetOpen(false); setSearchOpen(true) }}
          />
        )}
      </div>
    )
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      {channelHeader}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{messageList}</div>
        <ThreadPanel
          gifEnabled={gifEnabled}
          onCommand={(cmd, args) => { if (!isDm && cmd === 'poll') { setShowPollCreator(true); return true } if (!isDm && cmd === 'nick') { handleNick(args); return true } return false }}
        />
        {searchOpen && (
          <div className="absolute inset-0 z-30 md:relative md:inset-auto">
            <Suspense fallback={null}>
              <SearchDrawer
                query={searchQuery}
                onQueryChange={setSearchQuery}
                onClose={() => {
                  setSearchOpen(false)
                  setSearchQuery('')
                }}
              />
            </Suspense>
          </div>
        )}
        {!threadOpen && !searchOpen && memberSidebar}
      </div>

      {editingChannel && activeChannel && (
        <Suspense fallback={null}>
          <EditChannelModal channel={activeChannel} onClose={() => setEditingChannel(false)} />
        </Suspense>
      )}
      {isMobile && channelInfoOpen && activeChannel && channelServer && (
        <ChannelInfoPanel
          open={channelInfoOpen}
          onClose={() => setChannelInfoOpen(false)}
          channelName={activeChannel.name}
          channelId={activeChannel.id}
          serverId={activeChannel.serverId}
          serverName={channelServer.name}
          vanityCode={channelServer.vanityCode ?? null}
          pinnedCount={activeChannel.pinnedCount ?? 0}
          isAdmin={isAdminOrOwner}
          onSearch={() => {
            setChannelInfoOpen(false)
            setSearchOpen(true)
          }}
          onSaved={() => {
            setChannelInfoOpen(false)
            setSavedOpen(true)
          }}
          onSettings={() => {
            setChannelInfoOpen(false)
            setEditingChannel(true)
          }}
          loadPinned={pinned.loadPinned}
          pinnedMessages={pinned.pinnedMessages}
          pinnedLoading={pinned.pinnedLoading}
          canUnpin={isAdminOrOwner}
          onJumpToMessage={(messageId) => {
            void scroll.handleJumpToMessage(messageId)
          }}
        />
      )}
    </section>
  )
}
