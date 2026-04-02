import type { Message } from '@chat/shared'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
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
import { useMemberStore } from '@/stores/member.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { Permission as SharedPermission, hasPermission as hasPermFlag } from '@chat/shared'
import { useDmStore } from '@/stores/dm.store'
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
import { SearchBar } from '@/components/SearchBar'
const SearchDrawer = lazy(() => import('@/components/search/SearchDrawer').then((m) => ({ default: m.SearchDrawer })))
const EditChannelModal = lazy(() =>
  import('@/components/channel/EditChannelModal').then((m) => ({ default: m.EditChannelModal }))
)
import { ChannelInfoSheet } from '@/components/chat/ChannelInfoSheet'
import { DmInfoSheet } from '@/components/dm/DmInfoSheet'
import { CountBadge, IconButton, Spinner } from '@/components/ui'

/* ── Small icons ── */

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function HashChannelIcon() {
  return (
    <svg className="h-6 w-6 text-gray-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  )
}

function MembersToggleIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  )
}

function ChannelSettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}

function PinHeaderIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M12 2v8m0 0-3-3m3 3 3-3M9 17h6m-6 0v4m6-4v4M5 12h14" />
    </svg>
  )
}

function BookmarkHeaderIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function AtIcon() {
  return (
    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 4.4 19 1 1 0 0 0-.8-1.8A8 8 0 1 1 20 12v1.5a2.5 2.5 0 0 1-5 0V8h-2v.3A5 5 0 1 0 15 17a4.5 4.5 0 0 0 7-3.5V12A10 10 0 0 0 12 2zm0 13a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  )
}

/* ── MessageArea ── */

export interface MessageAreaProps {
  mode: 'channel' | 'dm'
  contextId: string | null
  memberSidebar?: React.ReactNode
}

export function MessageArea({ mode, contextId, memberSidebar }: MessageAreaProps) {
  const isMobile = useIsMobile()
  const threadOpen = useThreadStore((s) => s.isOpen)
  const isDm = mode === 'dm'
  const store = useMessageStoreAdapter(mode)
  const { messages, isLoading, hasMore, hasNewer } = store
  const messagesError = isDm
    ? useDmStore((s) => s.messagesError)
    : useMessageStore((s) => s.messagesError)

  const userId = useAuthStore((s) => s.user?.id)

  const scroll = useMessageScroll(contextId, store)
  const dm = useDmContext(isDm, userId)
  const { cardUser, cardRect, closeCard, handleUserClick, handleMentionClick } = useProfileCard(isDm, dm.currentConv)
  const typingNames = useTypingIndicators(isDm, contextId, userId)
  const { lastOwnMsg, seenByLabel } = useReadReceipts(isDm, contextId, dm.currentConv, userId, messages)

  const channelId = isDm ? null : contextId
  const dmConversationId = isDm ? contextId : null
  const pinned = usePinnedMessages(channelId, dmConversationId)

  const activeChannel = useChannelStore((s) => {
    if (isDm || !s.currentChannelId) return null
    const ch = s.channels.find((c) => c.id === s.currentChannelId)
    if (!ch || ch.serverId !== useServerStore.getState().currentServerId) return null
    return ch
  })

  const [editingChannel, setEditingChannel] = useState(false)
  const { has: hasPerm } = usePermissions(isDm ? null : useServerStore.getState().currentServerId)
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
  const currentServerId = useServerStore((s) => s.currentServerId)
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
  const [channelSheetOpen, setChannelSheetOpen] = useState(false)
  const [dmSheetOpen, setDmSheetOpen] = useState(false)

  const [replyTarget, setReplyTarget] = useState<{
    id: string
    content: string | null
    authorName: string
  } | null>(null)

  useEffect(() => {
    setReplyTarget(null)
  }, [contextId])

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? 'Deleted User'
    })
  }, [])

  const [gifEnabled, setGifEnabled] = useState(false)
  useEffect(() => {
    api
      .getGifEnabled()
      .then((r) => setGifEnabled(r.enabled))
      .catch(() => {})
  }, [])

  const channelRefsRef = useRef(dm.channelRefs)
  channelRefsRef.current = dm.channelRefs

  const handleNick = useCallback(async (args?: string) => {
    const name = args?.trim()
    if (!name) {
      setCommandToast('Usage: /nick <display name>')
      setTimeout(() => setCommandToast(null), 3000)
      return
    }
    if (name.length < 5 || name.length > 20) {
      setCommandToast('Display name must be 5–20 characters')
      setTimeout(() => setCommandToast(null), 3000)
      return
    }
    try {
      const updated = await api.updateProfile({ displayName: name })
      useAuthStore.getState().setUser(updated)
      useMemberStore.getState().updateUserProfile(updated.id, { displayName: updated.displayName })
      setCommandToast(`Display name changed to "${name}"`)
    } catch {
      setCommandToast('Failed to change display name')
    }
    setTimeout(() => setCommandToast(null), 3000)
  }, [])

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
              aria-label="Open navigation menu"
              onClick={useLayoutStore.getState().openNavDrawer}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <HamburgerIcon />
            </button>
          )}
          <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
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
      <p className="max-w-sm text-lg font-semibold text-white">Welcome to your server</p>
      <p className="max-w-sm text-sm text-gray-400">
        {isMobile
          ? 'Open the menu to pick a channel, or join a server using an invite link.'
          : 'Pick a text channel on the left to start chatting, or join a server using an invite link.'}
      </p>
    </div>
  ) : isLoading && messages.length === 0 ? (
    <DelayedRender loading delay={500} fallback={<div className="flex-1" />}>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
        <Spinner size="lg" />
        <p className="text-sm text-gray-400">Loading messages...</p>
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
        Retry
      </button>
    </div>
  ) : !isDm && activeChannel && messages.length === 0 ? (
    <div className="flex flex-1 flex-col justify-end pb-6">
      <div className="border-t border-white/10 pt-4">
        <h2 className="text-2xl font-bold text-white">
          This is the beginning of <span className="text-primary">#{activeChannel.name}</span>
        </h2>
        <p className="mt-2 text-[15px] text-gray-400">Send a message to spark the conversation.</p>
      </div>
    </div>
  ) : isDm && messages.length === 0 ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12">
      <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <h3 className="text-sm font-medium text-gray-400">No messages yet</h3>
      <p className="text-xs text-gray-500">Say hello to start the conversation!</p>
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

      <div aria-live="polite" className="px-4 py-1 text-xs text-gray-400">
        {typingNames.length > 0 ? formatTyping(typingNames) : ''}
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
              aria-label="Open navigation menu"
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
              onClick={() => setChannelSheetOpen(true)}
              className="min-w-0 flex-1 text-left"
            >
              <h1 className="truncate text-base font-semibold text-white">{activeChannel.name}</h1>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold text-white">{activeChannel.name}</h1>
            </div>
          )}
          {!isMobile && (
            <>
              <IconButton
                label="Pinned messages"
                size="lg"
                className="relative"
                onClick={() => void pinned.handleOpenPinned()}
              >
                <PinHeaderIcon />
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
                <BookmarkHeaderIcon />
              </IconButton>
              <NotifBellMenu channelId={activeChannel.id} serverId={activeChannel.serverId} />
              {isAdminOrOwner && (
                <IconButton
                  label="Channel settings"
                  size="lg"
                  onClick={() => setEditingChannel(true)}
                >
                  <ChannelSettingsIcon />
                </IconButton>
              )}
              <IconButton
                label="Toggle member list"
                size="lg"
                onClick={useLayoutStore.getState().toggleMemberSidebar}
              >
                <MembersToggleIcon />
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
        <h1 className="text-base font-semibold text-gray-400">Select a channel</h1>
      )}
    </header>
  ) : null

  if (isDm) {
    return (
      <div className="relative flex min-w-0 flex-1 bg-surface">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-2 shadow-sm md:px-4">
            {isMobile ? (
              <button
                type="button"
                aria-label="Open navigation menu"
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
                  <PinHeaderIcon />
                </IconButton>
                <IconButton
                  label="Saved messages"
                  className="shrink-0"
                  active={savedOpen}
                  onClick={() => setSavedOpen((v) => !v)}
                >
                  <BookmarkHeaderIcon />
                </IconButton>
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
          {messageList}
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
                  aria-label="Close profile"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="ml-2 text-sm font-semibold text-white">Profile</span>
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
      {channelSheetOpen && activeChannel && (
        <ChannelInfoSheet
          channelId={activeChannel.id}
          pinnedCount={activeChannel.pinnedCount ?? 0}
          isAdmin={isAdminOrOwner}
          onClose={() => setChannelSheetOpen(false)}
          onSearch={() => { setChannelSheetOpen(false); setSearchOpen(true) }}
          onPinned={() => { setChannelSheetOpen(false); void pinned.handleOpenPinned() }}
          onSaved={() => { setChannelSheetOpen(false); setSavedOpen(true) }}
          onMembers={() => { setChannelSheetOpen(false); useLayoutStore.getState().openMemberDrawer() }}
          onSettings={() => { setChannelSheetOpen(false); setEditingChannel(true) }}
        />
      )}
    </section>
  )
}
