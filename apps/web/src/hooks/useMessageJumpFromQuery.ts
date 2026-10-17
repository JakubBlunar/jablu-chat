import { useEffect } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import type { Message } from '@chat/shared'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumStore } from '@/stores/forum.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { showToast } from '@/stores/toast.store'

/**
 * Reads `?m=<messageId>` on channel or DM routes and scrolls to that message, then strips the param.
 */
export function useMessageJumpFromQuery() {
  const [searchParams, setSearchParams] = useSearchParams()
  const jumpId = searchParams.get('m')
  const threadId = searchParams.get('thread')
  const params = useParams()
  const location = useLocation()
  const isDmRoute = params.serverId === '@me' || location.pathname.startsWith('/channels/@me/')

  const viewMode = useServerStore((s) => s.viewMode)
  const serverId = useServerStore((s) => s.currentServerId)
  const channelId = useChannelStore((s) => s.currentChannelId)
  const conversationId = useDmStore((s) => s.currentConversationId)
  const loadedServerId = useChannelStore((s) => s.loadedServerId)
  const channelsLoading = useChannelStore((s) => s.isLoading)

  useEffect(() => {
    if (!jumpId) return
    // Route sync updates the stores in an effect. Never apply a new URL's
    // message id to the previous render's conversation.
    if (isDmRoute) {
      if (viewMode !== 'dm' || conversationId !== params.conversationId) return
    } else if (
      viewMode !== 'server' || serverId !== params.serverId || channelId !== params.channelId ||
      loadedServerId !== params.serverId || channelsLoading
    ) return

    let cancelled = false

    void (async () => {
      if (isDmRoute && conversationId) {
        await useNavigationStore.getState().navigateToDm({
          conversationId,
          scrollToMessageId: jumpId
        })
        if (useDmStore.getState().loadedForConvId !== conversationId) return
        if (!useDmStore.getState().messages.some((m) => m.id === jumpId)) {
          throw new Error('The notification message is no longer available.')
        }
      } else if (viewMode === 'server' && serverId && channelId) {
        const channel = useChannelStore.getState().channels.find((c) => c.id === channelId)
        if (!channel) return
        if (channel.type === 'forum') {
          const forum = useForumStore.getState()
          forum.init(channelId, channel.defaultLayout, channel.defaultSortOrder)
          forum.openPost(threadId ?? jumpId)
          if (threadId) {
            useForumReplyStore.setState({ focusMessageId: jumpId })
            useForumReplyStore.getState().setScrollToMessageId(jumpId)
          }
        } else {
          const targetId = threadId ?? jumpId
          await useNavigationStore.getState().navigateToChannel({
            serverId,
            channelId,
            scrollToMessageId: targetId
          })
          if (cancelled) return
          const messages = useMessageStore.getState()
          if (messages.loadedForChannelId !== channelId) return
          if (!threadId && !messages.messages.some((m) => m.id === jumpId)) {
            throw new Error('The notification message is no longer available.')
          }
          if (threadId) {
            let parent = messages.messages.find((m) => m.id === threadId)
            if (!parent) {
              const result = await api.get<{ messages: Message[] }>(
                `/api/channels/${channelId}/messages?around=${encodeURIComponent(threadId)}&limit=5`
              )
              if (cancelled) return
              parent = result.messages.find((m) => m.id === threadId)
            }
            if (!parent) throw new Error('The notification thread is no longer available.')
            useThreadStore.getState().openThread(channelId, parent, { focusMessageId: jumpId })
          }
        }
      }
      if (cancelled) return
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('m')
        next.delete('thread')
        return next
      }, { replace: true })
    })().catch((error) => {
      console.error('Failed to open notification target', error)
      showToast('Error', error instanceof Error ? error.message : 'Failed to open notification target.')
    })

    return () => {
      cancelled = true
    }
  }, [
    jumpId, threadId, viewMode, serverId, channelId, conversationId, setSearchParams,
    params.serverId, params.channelId, params.conversationId, isDmRoute,
    loadedServerId, channelsLoading, location.key
  ])
}
