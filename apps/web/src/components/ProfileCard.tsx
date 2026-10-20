import type { FriendshipStatusResponse, UserStatus } from '@chat/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { UserAvatar } from '@/components/UserAvatar'
import { ActivityLine } from '@/components/user/ActivityLine'
import { resolveMediaUrl } from '@/lib/api'
import { useActivityStore } from '@/stores/activity.store'
import { useProfileCardStore } from '@/stores/profileCard.store'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useIsMobile } from '@/hooks/useMobile'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'

export type ProfileCardUser = {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  bio?: string | null
  isBot?: boolean
  status: UserStatus
  customStatus?: string | null
  joinedAt?: string
  role?: string
  roleName?: string | null
  roleColor?: string | null
}

const statusLabel: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

type ProfileCardProps = {
  user: ProfileCardUser
  onClose: () => void
  anchorRect: DOMRect | null
}

export function ProfileCard(props: ProfileCardProps) {
  const isMobile = useIsMobile()
  return <ProfileCardPopup key={`${props.user.id}:${isMobile}`} {...props} isMobile={isMobile} />
}

function ProfileCardPopup({ user, onClose, anchorRect, isMobile }: ProfileCardProps & { isMobile: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [contentReady, setContentReady] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const visible = contentReady && position !== null
  const handleContentReady = useCallback(() => setContentReady(true), [])
  useFocusTrap(cardRef, !isMobile && visible, onClose)

  useLayoutEffect(() => {
    if (isMobile || !contentReady) return
    const card = cardRef.current
    if (!card) return

    const updatePosition = () => {
      const gap = 8
      const { width, height } = card.getBoundingClientRect()
      const maxLeft = Math.max(gap, window.innerWidth - width - gap)
      const maxTop = Math.max(gap, window.innerHeight - height - gap)
      let left = (window.innerWidth - width) / 2
      let top = (window.innerHeight - height) / 2

      if (anchorRect) {
        if (window.innerWidth - anchorRect.right - gap * 2 >= width) {
          left = anchorRect.right + gap
        } else if (anchorRect.left - gap * 2 >= width) {
          left = anchorRect.left - width - gap
        }
        top = anchorRect.top + height <= window.innerHeight - gap ? anchorRect.top : anchorRect.bottom - height
      }

      left = Math.max(gap, Math.min(left, maxLeft))
      top = Math.max(gap, Math.min(top, maxTop))
      setPosition((previous) => (previous?.left === left && previous.top === top ? previous : { left, top }))
    }

    updatePosition()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updatePosition)
    observer?.observe(card)
    window.addEventListener('resize', updatePosition)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [anchorRect, isMobile, contentReady])

  useEffect(() => {
    if (isMobile) return
    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, isMobile])

  if (isMobile) {
    return createPortal(
      <ModalOverlay
        onClose={onClose}
        zIndex="z-[110]"
        maxWidth="max-w-[320px]"
        noPadding
        className="max-h-[80vh] overflow-y-auto overflow-x-hidden"
      >
        <div ref={cardRef}>
          <ProfileCardContent user={user} onClose={onClose} />
        </div>
      </ModalOverlay>,
      document.body
    )
  }

  return createPortal(
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-label={user.displayName ?? user.username}
      aria-busy={!contentReady}
      style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: visible ? 'visible' : 'hidden' }}
      className="fixed z-[90] max-h-[calc(100dvh-16px)] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-lg bg-surface-overlay shadow-2xl ring-1 ring-black/30"
    >
      <ProfileCardContent user={user} onClose={onClose} onReady={handleContentReady} />
    </div>,
    document.body
  )
}

type MutualServer = {
  id: string
  name: string
  iconUrl: string | null
}

type MutualFriend = {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  status: string
}

type XpProgress = Awaited<ReturnType<typeof api.getMemberXpProgress>>

function ProfileCardContent({
  user,
  onClose,
  onReady
}: {
  user: ProfileCardUser
  onClose: () => void
  onReady?: () => void
}) {
  const { t } = useTranslation('chat')
  const currentUserId = useAuthStore((s) => s.user?.id)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const currentServer = useServerStore((s) =>
    s.currentServerId ? (s.servers.find((sv) => sv.id === s.currentServerId) ?? null) : null
  )
  const adminRole = useMemberStore((s) => {
    if (!currentServerId) return null
    const member = s.members.find((m) => m.userId === user.id && m.serverId === currentServerId)
    const roles = (member?.roles ?? []).filter((r) => !r.isDefault && r.isAdmin)
    if (roles.length === 0) return null
    return roles.reduce((a, b) => (a.position > b.position ? a : b))
  })
  const [mutualServers, setMutualServers] = useState<MutualServer[]>([])
  const [mutualFriends, setMutualFriends] = useState<MutualFriend[]>([])
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatusResponse | null>(null)
  const [canDm, setCanDm] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<XpProgress | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const dmRequest = useRef({ version: 0 })
  const activity = useActivityStore((s) => s.activities.get(user.id))
  const { orchestratedGoToChannel } = useAppNavigate()

  const refreshCanDm = useCallback(async () => {
    const requestState = dmRequest.current
    const request = ++requestState.version
    const result = await api.canDmUser(user.id)
    if (request === requestState.version) setCanDm(result.allowed)
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    const requestState = dmRequest.current
    const requests: Promise<void>[] = []
    setLoadFailed(false)

    if (user.id !== currentUserId) {
      const cached = useProfileCardStore.getState().peek(user.id)
      if (cached) {
        setMutualServers(cached.mutualServers)
        setMutualFriends(cached.mutualFriends)
        setFriendshipStatus(cached.friendshipStatus)
      }
      requests.push(
        (async () => {
          const request = useProfileCardStore.getState().load(user.id, { isBot: user.isBot })
          const detail = await (useProfileCardStore.getState().inflight.get(user.id) ?? request)
          if (cancelled) return
          setMutualServers(detail.mutualServers)
          setMutualFriends(detail.mutualFriends)
          setFriendshipStatus(detail.friendshipStatus)
        })(),
        refreshCanDm()
      )
    }

    if (currentServer?.xpEnabled) {
      requests.push(
        api.getMemberXpProgress(currentServer.id, user.id).then((result) => {
          if (!cancelled) setProgress(result)
        })
      )
    } else {
      setProgress(null)
    }

    if (requests.length === 0) {
      onReady?.()
    } else {
      void Promise.allSettled(requests).then((results) => {
        if (cancelled) return
        const failures = results.filter((result) => result.status === 'rejected')
        for (const failure of failures) console.error('Could not load profile content', failure.reason)
        setLoadFailed(failures.length > 0)
        onReady?.()
      })
    }

    return () => {
      cancelled = true
      requestState.version++
    }
  }, [user.id, user.isBot, currentUserId, currentServer?.id, currentServer?.xpEnabled, onReady, refreshCanDm])

  const handleFriendshipStatusChange = useCallback(
    (status: FriendshipStatusResponse) => {
      setFriendshipStatus(status)
      setCanDm(null)
      void refreshCanDm().catch((error: unknown) => {
        console.error('Could not refresh direct-message permissions', error)
        setLoadFailed(true)
      })
    },
    [refreshCanDm]
  )

  return (
    <>
      <div className="h-16 bg-primary" />

      <div className="px-4 pb-3">
        <div className="-mt-8">
          <div className="inline-block rounded-full border-[5px] border-surface-overlay">
            <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size="lg" showStatus status={user.status} />
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">{user.displayName ?? user.username}</h3>
          {user.isBot && (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BOT</span>
          )}
          {adminRole && <RoleBadge name={adminRole.name} color={adminRole.color} size="sm" showDot={false} />}
        </div>

        {user.displayName && user.displayName !== user.username && (
          <p className="text-xs text-gray-400">@{user.username}</p>
        )}
        <p className="text-xs text-gray-400">{statusLabel[user.status]}</p>
        {user.customStatus && <p className="mt-0.5 text-xs text-gray-300 italic">{user.customStatus}</p>}

        {activity && (
          <div className="mt-3 rounded-md bg-black/20 p-2.5">
            <SectionHeading className="mb-1.5">
              {activity.kind === 'music' ? 'LISTENING TO SPOTIFY' : 'PLAYING A GAME'}
            </SectionHeading>
            <ActivityLine activity={activity} variant="card" />
          </div>
        )}

        <div className="my-3 border-t border-white/10" />

        {user.bio && (
          <div className="mb-3">
            <SectionHeading className="mb-0.5">ABOUT ME</SectionHeading>
            <p className="whitespace-pre-wrap text-sm text-gray-200">{user.bio}</p>
          </div>
        )}

        {user.joinedAt && (
          <div className="mb-3">
            <SectionHeading className="mb-0.5">MEMBER SINCE</SectionHeading>
            <p className="text-sm text-gray-200">{formatDate(user.joinedAt)}</p>
          </div>
        )}

        {mutualFriends.length > 0 && (
          <div className="mb-3">
            <SectionHeading className="mb-1">MUTUAL FRIENDS — {mutualFriends.length}</SectionHeading>
            <div className="flex flex-wrap gap-1.5">
              {mutualFriends.slice(0, 8).map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1"
                  title={f.displayName ?? f.username}
                >
                  <UserAvatar username={f.username} avatarUrl={f.avatarUrl} size="sm" />
                  <span className="max-w-[80px] truncate text-xs text-gray-300">{f.displayName ?? f.username}</span>
                </div>
              ))}
              {mutualFriends.length > 8 && (
                <span className="flex items-center px-1.5 text-xs text-gray-500">+{mutualFriends.length - 8} more</span>
              )}
            </div>
          </div>
        )}

        {mutualServers.length > 0 && (
          <div className="mb-3">
            <SectionHeading className="mb-1">MUTUAL SERVERS — {mutualServers.length}</SectionHeading>
            <div className="space-y-0.5">
              {mutualServers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    void orchestratedGoToChannel(s.id)
                    onClose()
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition hover:bg-white/5"
                >
                  <ServerIcon name={s.name} iconUrl={s.iconUrl} />
                  <span className="min-w-0 truncate text-sm text-gray-200">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <RoleBadges userId={user.id} />
        <XpProgressSection progress={currentServer?.xpEnabled ? progress : null} />
        <VoiceVolumeSlider userId={user.id} />
        {loadFailed && (
          <p role="alert" className="mb-3 text-xs text-red-400">
            {t('profileLoadFailed')}
          </p>
        )}
        {!user.isBot && (
          <FriendButton userId={user.id} status={friendshipStatus} onStatusChange={handleFriendshipStatusChange} />
        )}
        <SendDmButton userId={user.id} onClose={onClose} canDm={canDm} />
      </div>
    </>
  )
}

function ServerIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return <img src={resolveMediaUrl(iconUrl)} alt={name} className="h-5 w-5 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/30 text-[10px] font-bold text-white">
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function VoiceVolumeSlider({ userId }: { userId: string }) {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const currentChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const voiceParticipants = useVoiceStore((s) => s.participants)
  const volume = useVoiceConnectionStore((s) => s.volumeOverrides[userId] ?? 100)
  const setVolumeOverride = useVoiceConnectionStore((s) => s.setVolumeOverride)

  if (!currentChannelId || userId === currentUserId) return null

  const channelParticipants = voiceParticipants[currentChannelId]
  if (!channelParticipants?.some((p) => p.userId === userId)) return null

  return (
    <div className="mb-3">
      <SectionHeading className="mb-1">VOICE VOLUME</SectionHeading>
      <div className="flex items-center gap-3 rounded-md bg-surface-darkest px-3 py-2">
        <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
        </svg>
        <input
          type="range"
          min={0}
          max={200}
          value={volume}
          onChange={(e) => setVolumeOverride(userId, Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer accent-primary"
        />
        <span className="w-10 text-right text-xs tabular-nums text-gray-300">{volume}%</span>
      </div>
      {volume !== 100 && (
        <button
          type="button"
          onClick={() => setVolumeOverride(userId, 100)}
          className="mt-1 text-[11px] text-gray-500 transition hover:text-gray-300"
        >
          Reset to 100%
        </button>
      )}
    </div>
  )
}

function FriendButton({
  userId,
  status,
  onStatusChange
}: {
  userId: string
  status: FriendshipStatusResponse | null
  onStatusChange: (s: FriendshipStatusResponse) => void
}) {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [loading, setLoading] = useState(false)

  const handleSendRequest = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.sendFriendRequest(userId)
      onStatusChange({ status: 'pending_outgoing', friendshipId: res.friendshipId })
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [userId, onStatusChange])

  const handleAccept = useCallback(async () => {
    if (!status?.friendshipId) return
    setLoading(true)
    try {
      await api.acceptFriendRequest(status.friendshipId)
      onStatusChange({ status: 'friends', friendshipId: status.friendshipId })
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [status, onStatusChange])

  const handleCancel = useCallback(async () => {
    if (!status?.friendshipId) return
    setLoading(true)
    try {
      await api.cancelFriendRequest(status.friendshipId)
      onStatusChange({ status: 'none', friendshipId: null })
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [status, onStatusChange])

  if (!status || userId === currentUserId) return null

  if (status.status === 'friends') {
    return (
      <div className="mt-3">
        <span className="block rounded-md bg-white/5 px-3 py-1.5 text-center text-sm text-green-400">Friends</span>
      </div>
    )
  }

  if (status.status === 'pending_outgoing') {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-center text-sm text-gray-400">Request Sent</span>
        <button
          type="button"
          disabled={loading}
          onClick={handleCancel}
          className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-gray-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (status.status === 'pending_incoming') {
    return (
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleAccept}
          className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          Accept Request
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={loading}
        onClick={handleSendRequest}
        className="w-full rounded-md bg-white/5 px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
      >
        Add Friend
      </button>
    </div>
  )
}

function SendDmButton({ userId, onClose, canDm }: { userId: string; onClose: () => void; canDm: boolean | null }) {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { goToDm } = useAppNavigate()
  const addOrUpdateConv = useDmStore((s) => s.addOrUpdateConversation)
  const [loading, setLoading] = useState(false)
  const [dmError, setDmError] = useState<string | null>(null)

  const handleClick = useCallback(async () => {
    if (!userId || userId === currentUserId) return
    setLoading(true)
    setDmError(null)
    try {
      const conv = await api.createDm(userId)
      addOrUpdateConv(conv)
      const socket = getSocket()
      if (socket?.connected) {
        socket.emit('dm:join', { conversationId: conv.id })
      }
      goToDm(conv.id)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open conversation'
      setDmError(msg.includes('friends') ? msg : 'Failed to open conversation')
    } finally {
      setLoading(false)
    }
  }, [userId, currentUserId, addOrUpdateConv, goToDm, onClose])

  if (userId === currentUserId) return null

  if (canDm === false) {
    return (
      <div className="mt-3">
        <p className="text-xs text-gray-500">Become friends to send messages.</p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {dmError && <p className="mb-1.5 text-xs text-red-400">{dmError}</p>}
      <button
        type="button"
        disabled={loading || canDm === null}
        onClick={handleClick}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? 'Opening…' : 'Message'}
      </button>
    </div>
  )
}

function RoleBadges({ userId }: { userId: string }) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const member = useMemberStore((s) => s.members.find((m) => m.userId === userId && m.serverId === currentServerId))

  if (!currentServerId) return null

  const roles = (member?.roles ?? []).filter((r) => !r.isDefault)
  if (roles.length === 0) return null

  return (
    <div className="mb-3">
      <SectionHeading className="mb-1">ROLES</SectionHeading>
      <div className="flex flex-wrap gap-1">
        {roles.map((role) => (
          <RoleBadge key={role.id} name={role.name} color={role.color} size="md" />
        ))}
      </div>
    </div>
  )
}

function XpProgressSection({ progress }: { progress: XpProgress | null }) {
  if (!progress) return null

  const pct =
    progress.xpNeededForLevel > 0
      ? Math.min(100, Math.round((progress.xpIntoLevel / progress.xpNeededForLevel) * 100))
      : 0

  return (
    <div className="mb-3">
      <SectionHeading className="mb-1">LEVEL</SectionHeading>
      <div className="rounded-md bg-white/5 p-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold text-white">Level {progress.level}</span>
          <span className="text-xs text-gray-400 tabular-nums">
            {progress.xpIntoLevel.toLocaleString()} / {progress.xpNeededForLevel.toLocaleString()} XP
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
