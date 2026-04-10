import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

/**
 * Keeps the Socket.IO channel room in sync with `currentChannelId`.
 *
 * `MessageArea` + `useMessageScroll` only emit `channel:join` for text channels.
 * Forum routes render `ForumView` instead, and `useRouteSync` only updates stores,
 * so without this hook a client can be "viewing" a forum while still in the wrong
 * socket room (or none) — then `message:thread-update` / `forum:*` events never arrive.
 */
export function useChannelSocketSync(isConnected: boolean) {
  const viewMode = useServerStore((s) => s.viewMode)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const joinedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isConnected) {
      joinedRef.current = null
      return
    }

    const socket = getSocket()
    if (!socket) return

    if (viewMode !== 'server') {
      const prev = joinedRef.current
      if (prev) {
        socket.emit('channel:leave', { channelId: prev })
        joinedRef.current = null
      }
      return
    }

    const next = currentChannelId
    const prev = joinedRef.current
    if (prev === next) return

    if (prev) socket.emit('channel:leave', { channelId: prev })
    if (next) socket.emit('channel:join', { channelId: next })
    joinedRef.current = next
  }, [isConnected, viewMode, currentChannelId])
}
