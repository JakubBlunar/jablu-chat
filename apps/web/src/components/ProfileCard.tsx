import type { FriendshipStatusResponse, UserStatus } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { UserAvatar } from '@/components/UserAvatar'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useIsMobile } from '@/hooks/useMobile'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore } from '@/stores/voice.store'

export type ProfileCardUser = {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
  bio?: string | null
  status: UserStatus
  joinedAt?: string
  role?: string
}

const statusLabel: Record<UserStatus, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
}

function roleLabel(role?: string): string | null {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return null
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

export function ProfileCard({
  user,
  onClose,
  anchorRect
}: {
  user: ProfileCardUser
  onClose: () => void
  anchorRect: DOMRect | null
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [onClose])

  const badge = roleLabel(user.role)

  if (isMobile) {
    return createPortal(
      <ModalOverlay onClose={onClose} zIndex="z-[110]" maxWidth="max-w-[320px]" noPadding className="max-h-[80vh] overflow-y-auto overflow-x-hidden">
        <div ref={cardRef}>
          <ProfileCardContent user={user} badge={badge} onClose={onClose} />
        </div>
      </ModalOverlay>,
      document.body
    )
  }

  const style: React.CSSProperties = {}
  if (anchorRect) {
    style.position = 'fixed'
    const cardWidth = 320
    const rightSpace = window.innerWidth - anchorRect.right - 8
    const leftSpace = anchorRect.left - 8

    if (rightSpace >= cardWidth) {
      style.left = anchorRect.right + 8
    } else if (leftSpace >= cardWidth) {
      style.left = anchorRect.left - cardWidth - 8
    } else {
      style.left = Math.max(8, (window.innerWidth - cardWidth) / 2)
    }

    const cardHeight = 320
    if (anchorRect.top + cardHeight > window.innerHeight) {
      style.bottom = Math.max(8, window.innerHeight - anchorRect.bottom)
    } else {
      style.top = anchorRect.top
    }
  }

  return (
    <div
      ref={cardRef}
      style={style}
      className="z-[90] w-[300px] overflow-hidden rounded-lg bg-surface-overlay shadow-2xl ring-1 ring-black/30"
    >
      <ProfileCardContent user={user} badge={badge} onClose={onClose} />
    </div>
  )
}

type MutualServer = {
  id: string
  name: string
  iconUrl: string | null
}

function ProfileCardContent({
  user,
  badge,
  onClose
}: {
  user: ProfileCardUser
  badge: string | null
  onClose: () => void
}) {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [mutualServers, setMutualServers] = useState<MutualServer[]>([])
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatusResponse | null>(null)
  const { orchestratedGoToChannel } = useAppNavigate()

  useEffect(() => {
    if (!user.id || user.id === currentUserId) return
    let cancelled = false
    api
      .getMutualServers(user.id)
      .then((res) => {
        if (!cancelled) setMutualServers(res.servers)
      })
      .catch(() => {})
    api
      .getFriendshipStatus(user.id)
      .then((res) => {
        if (!cancelled) setFriendshipStatus(res)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [user.id, currentUserId])

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
          {badge && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary ring-1 ring-primary/40">
              {badge}
            </span>
          )}
        </div>

        {user.displayName && user.displayName !== user.username && (
          <p className="text-xs text-gray-400">@{user.username}</p>
        )}
        <p className="text-xs text-gray-400">{statusLabel[user.status]}</p>

        <div className="my-3 border-t border-white/10" />

        {user.bio && (
          <div className="mb-3">
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-gray-400">ABOUT ME</p>
            <p className="whitespace-pre-wrap text-sm text-gray-200">{user.bio}</p>
          </div>
        )}

        {user.joinedAt && (
          <div className="mb-3">
            <p className="mb-0.5 text-[11px] font-semibold tracking-wide text-gray-400">MEMBER SINCE</p>
            <p className="text-sm text-gray-200">{formatDate(user.joinedAt)}</p>
          </div>
        )}

        {mutualServers.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-gray-400">
              MUTUAL SERVERS — {mutualServers.length}
            </p>
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

        <VoiceVolumeSlider userId={user.id} />
        <FriendButton userId={user.id} status={friendshipStatus} onStatusChange={setFriendshipStatus} />
        <SendDmButton userId={user.id} onClose={onClose} friendshipStatus={friendshipStatus} />
      </div>
    </>
  )
}

function ServerIcon({ name, iconUrl }: { name: string; iconUrl: string | null }) {
  if (iconUrl) {
    return <img src={iconUrl} alt={name} className="h-5 w-5 shrink-0 rounded-full object-cover" />
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
      <p className="mb-1 text-[11px] font-semibold tracking-wide text-gray-400">VOICE VOLUME</p>
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
        <span className="block rounded-md bg-white/5 px-3 py-1.5 text-center text-sm text-green-400">
          Friends
        </span>
      </div>
    )
  }

  if (status.status === 'pending_outgoing') {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="flex-1 rounded-md bg-white/5 px-3 py-1.5 text-center text-sm text-gray-400">
          Request Sent
        </span>
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

function SendDmButton({
  userId,
  onClose,
  friendshipStatus
}: {
  userId: string
  onClose: () => void
  friendshipStatus: FriendshipStatusResponse | null
}) {
  const currentUserId = useAuthStore((s) => s.user?.id)
  const { goToDm } = useAppNavigate()
  const addOrUpdateConv = useDmStore((s) => s.addOrUpdateConversation)
  const [loading, setLoading] = useState(false)
  const [dmError, setDmError] = useState<string | null>(null)
  const [canDm, setCanDm] = useState<boolean | null>(null)

  useEffect(() => {
    if (!userId || userId === currentUserId) return
    api.canDmUser(userId).then((res) => setCanDm(res.allowed)).catch(() => setCanDm(true))
  }, [userId, currentUserId, friendshipStatus])

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
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? 'Opening…' : 'Message'}
      </button>
    </div>
  )
}
