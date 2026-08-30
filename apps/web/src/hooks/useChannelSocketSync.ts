import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

/**
 * Makes sure the Socket.IO room for `currentChannelId` is joined.
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
      joinedRef.current = null
      return
    }

    const next = currentChannelId
    if (joinedRef.current === next) return

    // Joins only. The gateway already puts the socket in every visible
    // channel room on connect, and leaving a room would silence the events
    // that keep cached channels and unread badges up to date.
    if (next) socket.emit('channel:join', { channelId: next })
    joinedRef.current = next
  }, [isConnected, viewMode, currentChannelId])
}
