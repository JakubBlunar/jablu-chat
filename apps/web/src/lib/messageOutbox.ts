import type { Message } from '@chat/shared'
import type { Socket } from 'socket.io-client'
import { api, ApiError } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumStore } from '@/stores/forum.store'
import { useOutboxStore, mutateOutbox, type OutboxMessage } from '@/stores/outbox.store'
import { cacheAddMessage } from '@/lib/cache/contextMutations'
import { channelKey, dmKey } from '@/lib/cache/messageCache'

type SendAck = { ok?: boolean; message?: Message; error?: string; retryable?: boolean }
const LEASE_MS = 60_000

class DeliveryError extends Error {
  readonly retryable: boolean
  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

export function startMessageOutbox(socket: Socket, userId: string): () => void {
  const leaseOwner = crypto.randomUUID()
  let stopped = false
  let running = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const store = useOutboxStore
  store.setState({ userId, items: [], error: null })
  const active = () => !stopped && useAuthStore.getState().user?.id === userId && getSocket() === socket
  const schedule = (delay = 0) => {
    if (!active()) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      void run()
    }, delay)
  }
  const refresh = async () => {
    try {
      await store.getState().refresh(userId)
    } catch (error) {
      console.error('Failed to read message outbox', error)
      if (active()) store.setState({ error: 'outboxStorageFailed' })
    }
  }
  const publish = (message: Message) => {
    if (message.directConversationId) {
      const dm = useDmStore.getState()
      if (dm.loadedForConvId === message.directConversationId && !dm.hasNewer) dm.addMessage(message)
      cacheAddMessage(dmKey(message.directConversationId), message)
    } else if (message.threadParentId) {
      const thread = useThreadStore.getState()
      if (thread.parentMessage?.id === message.threadParentId) thread.addMessage(message)
      if (useForumStore.getState().currentPostId === message.threadParentId) {
        window.dispatchEvent(new CustomEvent('forum-reply', { detail: message }))
      }
    } else if (message.channelId) {
      const channel = useMessageStore.getState()
      if (channel.loadedForChannelId === message.channelId && !channel.hasNewer) channel.addMessage(message)
      cacheAddMessage(channelKey(message.channelId), message)
    }
  }
  async function run() {
    if (!active() || running) return
    running = true
    try {
      await refresh()
      if (!active() || !socket.connected) return
      const now = Date.now()
      const item = store.getState().items.find((entry) => entry.status !== 'failed')
      if (!item || item.nextAttemptAt > now || item.leaseUntil > now) return
      let claimed = await mutateOutbox(item.id, (current) => {
        if (!current || current.userId !== userId || current.status === 'failed' || current.leaseUntil > Date.now()) {
          return { message: current ?? null, result: null }
        }
        const message: OutboxMessage = {
          ...current,
          status: 'sending',
          leaseOwner,
          leaseUntil: Date.now() + LEASE_MS,
          attempts: current.attempts + 1
        }
        return { message, result: message }
      })
      if (!claimed) return
      const renew = setInterval(() => {
        if (!active()) return
        void mutateOutbox(item.id, (current) => ({
          message:
            current?.leaseOwner === leaseOwner ? { ...current, leaseUntil: Date.now() + LEASE_MS } : (current ?? null),
          result: undefined
        })).catch((error) => {
          console.error('Failed to renew message delivery lease', error)
        })
      }, LEASE_MS / 3)
      try {
        await refresh()
        if (claimed.files.length) {
          const maxMb = await api.getMaxUploadSizeMb()
          if (claimed.files.some((file) => file.size > maxMb * 1024 * 1024)) {
            throw new DeliveryError(`File too large. Max ${maxMb} MB allowed.`, false)
          }
        }
        while (claimed.attachmentIds.length < claimed.files.length) {
          if (!active() || !socket.connected) throw new DeliveryError('Connection lost', true)
          const attachment = await api.uploadAttachment(claimed.files[claimed.attachmentIds.length])
          claimed = { ...claimed, attachmentIds: [...claimed.attachmentIds, attachment.id] }
          const uploaded = claimed
          const saved = await mutateOutbox(item.id, (current) => ({
            message:
              current?.leaseOwner === leaseOwner ? { ...uploaded, leaseUntil: current.leaseUntil } : (current ?? null),
            result: current?.leaseOwner === leaseOwner
          }))
          if (!saved) throw new DeliveryError('Delivery is being handled by another window', true)
        }
        if (!active() || !socket.connected) throw new DeliveryError('Connection lost', true)
        const response: SendAck = await socket
          .timeout(10_000)
          .emitWithAck(claimed.mode === 'dm' ? 'dm:send' : 'message:send', {
            clientMessageId: claimed.id,
            ...(claimed.mode === 'dm' ? { conversationId: claimed.contextId } : { channelId: claimed.contextId }),
            content: claimed.content || undefined,
            replyToId: claimed.replyToId,
            threadParentId: claimed.threadParentId,
            attachmentIds: claimed.attachmentIds.length ? claimed.attachmentIds : undefined,
            targetBotAppId: claimed.targetBotAppId
          })
        if (
          !response?.ok ||
          !response.message ||
          response.message.id !== claimed.id ||
          response.message.authorId !== userId ||
          (claimed.mode === 'dm'
            ? response.message.directConversationId !== claimed.contextId
            : response.message.channelId !== claimed.contextId) ||
          (response.message.threadParentId ?? undefined) !== claimed.threadParentId
        ) {
          throw new DeliveryError(response?.error ?? 'Message was not acknowledged', response?.retryable ?? false)
        }
        await mutateOutbox(item.id, (current) => ({
          message: current?.leaseOwner === leaseOwner ? null : (current ?? null),
          result: undefined
        }))
        if (active()) publish(response.message)
      } catch (error) {
        const retryable =
          error instanceof DeliveryError
            ? error.retryable
            : !(error instanceof ApiError) || error.status >= 500 || error.status === 429
        const message = error instanceof Error ? error.message : 'Delivery failed'
        console.error('Message delivery failed', error)
        await mutateOutbox(item.id, (current) => ({
          message:
            current?.leaseOwner === leaseOwner
              ? {
                  ...current,
                  status: retryable ? 'queued' : 'failed',
                  error: message,
                  leaseUntil: 0,
                  nextAttemptAt: Date.now() + Math.min(60_000, 2000 * 2 ** Math.min(current.attempts - 1, 5))
                }
              : (current ?? null),
          result: undefined
        }))
      } finally {
        clearInterval(renew)
      }
    } catch (error) {
      console.error('Failed to persist message delivery state', error)
      if (active()) store.setState({ error: 'outboxStorageFailed' })
    } finally {
      running = false
      if (active()) {
        await refresh()
        if (store.getState().items.some((item) => item.status !== 'failed')) schedule(1200)
      }
    }
  }
  const onChange = () => {
    void refresh()
    schedule()
  }
  const onVisible = () => {
    if (!document.hidden) schedule()
  }
  socket.on('connect', onChange)
  window.addEventListener('online', onChange)
  window.addEventListener('jablu-outbox-changed', onChange)
  document.addEventListener('visibilitychange', onVisible)
  schedule()
  return () => {
    stopped = true
    clearTimeout(timer)
    socket.off('connect', onChange)
    window.removeEventListener('online', onChange)
    window.removeEventListener('jablu-outbox-changed', onChange)
    document.removeEventListener('visibilitychange', onVisible)
    if (store.getState().userId === userId) store.setState({ userId: null, items: [], error: null })
  }
}
