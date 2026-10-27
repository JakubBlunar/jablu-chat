import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useForumStore } from '@/stores/forum.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumReplyStore } from '@/stores/forumReply.store'

/** Full messages follow this device's open context; background rooms stay joined. */
export function useChannelSocketSync(isConnected: boolean) {
  const viewMode = useServerStore((s) => s.viewMode)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const currentConversationId = useDmStore((s) => s.currentConversationId)
  const channelId = viewMode === 'server' ? currentChannelId : null
  const conversationId = viewMode === 'dm' ? currentConversationId : null

  useEffect(() => {
    if (!isConnected) return
    const socket = getSocket()
    if (!socket) return

    let disposed = false
    let subscription = 0
    const cleanups: (() => void)[] = []
    // A prefetch can read its snapshot before the subscription is admitted.
    // Wait for it to finish, then refresh after the join acknowledgement.
    const whenReady = <T extends { isLoading: boolean }>(
      store: {
        getState: () => T
        subscribe: (listener: () => void) => () => void
      },
      refresh: (state: T) => void
    ) => {
      let unsubscribe: (() => void) | undefined
      const run = () => {
        if (disposed || store.getState().isLoading) return
        unsubscribe?.()
        refresh(store.getState())
      }
      if (store.getState().isLoading) {
        unsubscribe = store.subscribe(run)
        cleanups.push(unsubscribe)
      } else run()
    }
    const subscribe = () => {
      const generation = ++subscription
      cleanups.splice(0).forEach((cleanup) => cleanup())
      socket.emit('channel:watch', channelId ? { channelId } : {}, (result: { ok?: boolean }) => {
        if (disposed || generation !== subscription || !result?.ok || !channelId) return
        whenReady(useMessageStore, (state) => {
          if (state.loadedForChannelId === channelId) void state.revalidate(channelId)
        })
        whenReady(useForumStore, (state) => {
          if (state.channelId === channelId) void state.fetchPosts()
        })
        whenReady(useThreadStore, (state) => {
          if (state.isOpen && state.channelId === channelId && !state.hasNewer) void state.fetchMessages()
        })
        whenReady(useForumReplyStore, (state) => {
          if (state.channelId === channelId && !state.hasNewer) void state.fetchMessages()
        })
      })
      socket.emit('dm:watch', conversationId ? { conversationId } : {}, (result: { ok?: boolean }) => {
        if (disposed || generation !== subscription || !result?.ok || !conversationId) return
        whenReady(useDmStore, (state) => {
          if (state.loadedForConvId === conversationId) void state.revalidate(conversationId)
        })
      })
    }
    subscribe()
    socket.on('message:subscriptions-reset', subscribe)
    return () => {
      disposed = true
      socket.off('message:subscriptions-reset', subscribe)
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [isConnected, channelId, conversationId])
}
