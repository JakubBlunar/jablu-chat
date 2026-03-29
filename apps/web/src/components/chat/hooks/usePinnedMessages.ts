import type { Message } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export function usePinnedMessages(channelId: string | null, conversationId?: string | null) {
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [pinnedLoading, setPinnedLoading] = useState(false)

  const activeId = channelId ?? conversationId ?? null
  const isDm = !channelId && !!conversationId

  useEffect(() => {
    setPinnedOpen(false)
    setPinnedMessages([])
  }, [activeId])

  const handleOpenPinned = useCallback(async () => {
    if (!activeId) return
    if (pinnedOpen) {
      setPinnedOpen(false)
      return
    }
    setPinnedOpen(true)
    setPinnedLoading(true)
    try {
      const msgs = isDm
        ? await api.getPinnedDmMessages(activeId)
        : await api.getPinnedMessages(activeId)
      setPinnedMessages(msgs)
    } catch {
      setPinnedMessages([])
    } finally {
      setPinnedLoading(false)
    }
  }, [activeId, pinnedOpen, isDm])

  useEffect(() => {
    if (!pinnedOpen || !activeId) return
    const socket = getSocket()
    if (!socket) return

    if (isDm) {
      const onPin = (msg: Message & { conversationId?: string }) => {
        if (msg.directConversationId === activeId || msg.conversationId === activeId) {
          setPinnedMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]))
        }
      }
      const onUnpin = (msg: Message & { conversationId?: string }) => {
        if (msg.directConversationId === activeId || msg.conversationId === activeId) {
          setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id))
        }
      }
      socket.on('dm:pin', onPin)
      socket.on('dm:unpin', onUnpin)
      return () => {
        socket.off('dm:pin', onPin)
        socket.off('dm:unpin', onUnpin)
      }
    }

    const onPin = (msg: Message) => {
      if (msg.channelId === activeId) {
        setPinnedMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [msg, ...prev]))
      }
    }
    const onUnpin = (msg: Message) => {
      if (msg.channelId === activeId) {
        setPinnedMessages((prev) => prev.filter((m) => m.id !== msg.id))
      }
    }
    socket.on('message:pin', onPin)
    socket.on('message:unpin', onUnpin)
    return () => {
      socket.off('message:pin', onPin)
      socket.off('message:unpin', onUnpin)
    }
  }, [pinnedOpen, activeId, isDm])

  useEffect(() => {
    const handler = () => {
      if (activeId && !pinnedOpen) void handleOpenPinned()
    }
    window.addEventListener('open-pinned', handler)
    return () => window.removeEventListener('open-pinned', handler)
  }, [activeId, pinnedOpen, handleOpenPinned])

  return { pinnedOpen, pinnedMessages, pinnedLoading, handleOpenPinned, setPinnedOpen, isDm }
}
