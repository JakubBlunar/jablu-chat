import type { Message } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export function usePinnedMessages(channelId: string | null, conversationId?: string | null) {
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([])
  const [pinnedLoading, setPinnedLoading] = useState(false)
  const [pinnedError, setPinnedError] = useState(false)
  const requestId = useRef(0)

  const activeId = channelId ?? conversationId ?? null
  const isDm = !channelId && !!conversationId

  useEffect(() => {
    const requests = requestId
    requests.current++
    setPinnedOpen(false)
    setPinnedMessages([])
    setPinnedError(false)
    return () => { requests.current++ }
  }, [activeId])

  const loadPinned = useCallback(async () => {
    if (!activeId) return
    const request = ++requestId.current
    setPinnedLoading(true)
    setPinnedError(false)
    try {
      const msgs = isDm
        ? await api.getPinnedDmMessages(activeId)
        : await api.getPinnedMessages(activeId)
      if (request === requestId.current) setPinnedMessages(msgs)
    } catch {
      if (request === requestId.current) setPinnedError(true)
    } finally {
      if (request === requestId.current) setPinnedLoading(false)
    }
  }, [activeId, isDm])

  const handleOpenPinned = useCallback(async () => {
    if (!activeId) return
    if (pinnedOpen) {
      setPinnedOpen(false)
      return
    }
    setPinnedOpen(true)
    await loadPinned()
  }, [activeId, pinnedOpen, loadPinned])

  useEffect(() => {
    if (!activeId) return
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
  }, [activeId, isDm])

  useEffect(() => {
    const handler = () => {
      if (activeId && !pinnedOpen) void handleOpenPinned()
    }
    window.addEventListener('open-pinned', handler)
    return () => window.removeEventListener('open-pinned', handler)
  }, [activeId, pinnedOpen, handleOpenPinned])

  return { pinnedOpen, pinnedMessages, pinnedLoading, pinnedError, handleOpenPinned, setPinnedOpen, loadPinned, isDm }
}
