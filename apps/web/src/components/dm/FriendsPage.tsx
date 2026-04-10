import type { Friend, FriendRequest, FriendshipStatusResponse } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusDot } from '@/components/ui/StatusDot'
import { UserAvatar } from '@/components/UserAvatar'
import { useIsMobile } from '@/hooks/useMobile'
import { api } from '@/lib/api'
import { useFriendStore } from '@/stores/friend.store'
import { useDmStore } from '@/stores/dm.store'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useLayoutStore } from '@/stores/layout.store'

type Tab = 'online' | 'all' | 'pending'

const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

export function FriendsPage() {
  const { t } = useTranslation('nav')
  const { t: tA11y } = useTranslation('a11y')
  const friends = useFriendStore((s) => s.friends)
  const pending = useFriendStore((s) => s.pending)
  const isLoading = useFriendStore((s) => s.isLoading)
  const fetchFriends = useFriendStore((s) => s.fetchFriends)
  const fetchPending = useFriendStore((s) => s.fetchPending)
  const isMobile = useIsMobile()

  const [tab, setTab] = useState<Tab>('online')
  const [addFriendOpen, setAddFriendOpen] = useState(false)

  useEffect(() => {
    fetchFriends()
    fetchPending()
  }, [fetchFriends, fetchPending])

  useEffect(() => {
    if (tab === 'pending' && pending.length === 0) setTab('online')
  }, [tab, pending.length])

  const onlineFriends = useMemo(() => friends.filter((f) => f.status !== 'offline'), [friends])
  const displayedFriends = tab === 'online' ? onlineFriends : friends

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="flex shrink-0 items-center gap-3 border-b border-black/20 px-2 py-3 md:px-4">
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
          <FriendsIcon />
        )}
        <h1 className="text-base font-semibold text-white">{t('friends')}</h1>
        <div className="ml-2 flex items-center gap-1" role="tablist">
          <TabBtn active={tab === 'online'} onClick={() => { setTab('online'); setAddFriendOpen(false) }}>
            Online
          </TabBtn>
          <TabBtn active={tab === 'all'} onClick={() => { setTab('all'); setAddFriendOpen(false) }}>
            All
          </TabBtn>
          {(pending.length > 0 || tab === 'pending') && (
            <TabBtn active={tab === 'pending'} onClick={() => { setTab('pending'); setAddFriendOpen(false) }}>
              Pending
              {pending.length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pending.length}
                </span>
              )}
            </TabBtn>
          )}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setAddFriendOpen(!addFriendOpen)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            addFriendOpen
              ? 'bg-transparent text-gray-300'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          Add Friend
        </button>
      </header>

      {addFriendOpen && <AddFriendSection onClose={() => setAddFriendOpen(false)} />}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'pending' ? (
          <PendingList items={pending} />
        ) : (
          <>
            <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase text-gray-400">
              {tab === 'online' ? `Online — ${onlineFriends.length}` : `All Friends — ${friends.length}`}
            </div>
            {isLoading && friends.length === 0 ? (
              <div className="space-y-2 px-4 py-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
                      <div className="h-2.5 w-16 animate-pulse rounded bg-white/5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedFriends.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                {tab === 'online' ? 'No friends are online right now.' : 'No friends yet. Add someone to get started!'}
              </div>
            ) : (
              displayedFriends.map((f) => <FriendRow key={f.id} friend={f} isMobile={isMobile} />)
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-sm font-medium transition ${
        active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
      }`}
    >
      {children}
    </button>
  )
}

function FriendRow({ friend, isMobile }: { friend: Friend; isMobile: boolean }) {
  const removeFriend = useFriendStore((s) => s.removeFriend)
  const addOrUpdateConversation = useDmStore((s) => s.addOrUpdateConversation)
  const { goToDm } = useAppNavigate()
  const [showConfirm, setShowConfirm] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  const handleMessage = useCallback(async () => {
    try {
      const conv = await api.createDm(friend.id)
      addOrUpdateConversation(conv)
      goToDm(conv.id)
    } catch {
      /* ignore */
    }
  }, [friend.id, addOrUpdateConversation, goToDm])

  const handleRemove = useCallback(async () => {
    try {
      await removeFriend(friend.friendshipId)
    } catch {
      setShowConfirm(false)
    }
  }, [removeFriend, friend.friendshipId])

  return (
    <div className="group flex items-center gap-3 border-t border-white/5 px-4 py-2 transition hover:bg-white/[0.03]">
      <UserAvatar
        username={friend.username}
        avatarUrl={friend.avatarUrl}
        size={isMobile ? 'md' : 'lg'}
        showStatus
        status={friend.status}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {friend.displayName ?? friend.username}
        </p>
        <div className="flex items-center gap-1.5">
          <StatusDot status={friend.status} />
          <span className="text-xs text-gray-400">{STATUS_LABELS[friend.status]}</span>
        </div>
      </div>
      <div ref={actionsRef} className="relative flex items-center gap-1">
        <ActionBtn title="Message" onClick={handleMessage}>
          <MessageIcon />
        </ActionBtn>
        <ActionBtn title="Remove friend" onClick={() => setShowConfirm(true)}>
          <RemoveIcon />
        </ActionBtn>
        {showConfirm && (
          <ConfirmDialog
            title="Remove Friend"
            description={`Are you sure you want to remove ${friend.displayName ?? friend.username}?`}
            confirmLabel="Remove"
            anchorRef={actionsRef}
            onConfirm={handleRemove}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    </div>
  )
}

function PendingList({ items }: { items: FriendRequest[] }) {
  const incoming = useMemo(() => items.filter((i) => i.direction === 'incoming'), [items])
  const outgoing = useMemo(() => items.filter((i) => i.direction === 'outgoing'), [items])

  return (
    <div>
      {incoming.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase text-gray-400">
            Incoming — {incoming.length}
          </div>
          {incoming.map((r) => (
            <PendingRow key={r.friendshipId} request={r} />
          ))}
        </>
      )}
      {outgoing.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 text-xs font-semibold uppercase text-gray-400">
            Outgoing — {outgoing.length}
          </div>
          {outgoing.map((r) => (
            <PendingRow key={r.friendshipId} request={r} />
          ))}
        </>
      )}
      {items.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-500">No pending friend requests.</div>
      )}
    </div>
  )
}

function PendingRow({ request }: { request: FriendRequest }) {
  const acceptRequest = useFriendStore((s) => s.acceptRequest)
  const declineRequest = useFriendStore((s) => s.declineRequest)
  const cancelRequest = useFriendStore((s) => s.cancelRequest)
  const isIncoming = request.direction === 'incoming'

  return (
    <div className="flex items-center gap-3 border-t border-white/5 px-4 py-2 transition hover:bg-white/[0.03]">
      <UserAvatar
        username={request.user.username}
        avatarUrl={request.user.avatarUrl}
        size="md"
        showStatus
        status={request.user.status}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {request.user.displayName ?? request.user.username}
        </p>
        <p className="text-xs text-gray-400">
          {isIncoming ? 'Incoming Friend Request' : 'Outgoing Friend Request'}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {isIncoming ? (
          <>
            <ActionBtn title="Accept" onClick={() => acceptRequest(request.friendshipId)}>
              <CheckIcon />
            </ActionBtn>
            <ActionBtn title="Decline" onClick={() => declineRequest(request.friendshipId)} danger>
              <XIcon />
            </ActionBtn>
          </>
        ) : (
          <ActionBtn title="Cancel" onClick={() => cancelRequest(request.friendshipId)} danger>
            <XIcon />
          </ActionBtn>
        )}
      </div>
    </div>
  )
}

function AddFriendSection({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }[]>([])
  const [statuses, setStatuses] = useState<Map<string, FriendshipStatusResponse>>(new Map())
  const [searching, setSearching] = useState(false)
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [searchError, setSearchError] = useState('')
  const [sendError, setSendError] = useState('')
  const searchGenRef = useRef(0)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearchError(''); return }
    const gen = ++searchGenRef.current
    const timeout = setTimeout(async () => {
      setSearching(true)
      setSearchError('')
      try {
        const res = await api.searchUsers(query.trim())
        if (gen !== searchGenRef.current) return
        setResults(res)
        const statusMap = new Map<string, FriendshipStatusResponse>()
        await Promise.all(
          res.map(async (u) => {
            try {
              const s = await api.getFriendshipStatus(u.id)
              statusMap.set(u.id, s)
            } catch {
              /* individual status check failures are non-critical */
            }
          })
        )
        if (gen !== searchGenRef.current) return
        setStatuses(statusMap)
      } catch {
        if (gen !== searchGenRef.current) return
        setResults([])
        setSearchError('Search failed. Please try again.')
      } finally {
        if (gen === searchGenRef.current) setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timeout)
  }, [query])

  const handleSend = useCallback(async (userId: string) => {
    setSendError('')
    try {
      await useFriendStore.getState().sendRequest(userId)
      setSent((prev) => new Set(prev).add(userId))
    } catch {
      setSendError('Failed to send request. Please try again.')
    }
  }, [])

  return (
    <div className="border-b border-white/5 bg-surface-dark px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-white">{t('addFriend')}</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
          aria-label={tCommon('close')}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="mb-3 text-xs text-gray-400">{t('addFriendHint')}</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('enterUsernamePlaceholder')}
        autoFocus
        className="w-full rounded-lg bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-primary"
      />
      {searching && <p className="mt-2 text-xs text-gray-500">{t('searchingUsers')}</p>}
      {searchError && <p className="mt-2 text-xs text-red-400">{searchError}</p>}
      {sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
      {results.length > 0 && (
        <div className="mt-2 max-h-52 space-y-1 overflow-y-auto scrollbar-thin">
          {results.map((u) => {
            const fs = statuses.get(u.id)
            const alreadySent = sent.has(u.id)
            return (
              <div key={u.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {u.displayName ?? u.username}
                  {u.displayName && <span className="ml-1 text-xs text-gray-400">@{u.username}</span>}
                </span>
                <FriendActionLabel status={fs} alreadySent={alreadySent} onSend={() => handleSend(u.id)} />
              </div>
            )
          })}
        </div>
      )}
      {results.length > 0 && (
        <p className="mt-1 text-[11px] text-gray-500">{results.length} result{results.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  )
}

function FriendActionLabel({
  status,
  alreadySent,
  onSend
}: {
  status?: FriendshipStatusResponse
  alreadySent: boolean
  onSend: () => void
}) {
  if (!status) return null
  if (status.status === 'friends') {
    return <span className="text-xs text-green-400">Friends</span>
  }
  if (status.status === 'pending_outgoing' || alreadySent) {
    return <span className="text-xs text-gray-400">Request Sent</span>
  }
  if (status.status === 'pending_incoming') {
    return <span className="text-xs text-yellow-400">Pending</span>
  }
  return (
    <button
      type="button"
      onClick={onSend}
      className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-text transition hover:bg-primary/80"
    >
      Send Request
    </button>
  )
}

function ActionBtn({
  title,
  onClick,
  children,
  danger
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface-dark transition hover:bg-white/10 active:scale-95 ${
        danger ? 'text-red-400 hover:text-red-300' : 'text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function FriendsIcon() {
  return (
    <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
    </svg>
  )
}

function MessageIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
