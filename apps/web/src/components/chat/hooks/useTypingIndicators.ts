import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { useMessageStore } from '@/stores/message.store'
import { useShallow } from 'zustand/react/shallow'

export function useTypingIndicators(isDm: boolean, contextId: string | null, userId: string | undefined) {
  const channelTypingNames = useMessageStore(
    useShallow((s) => {
      const out: string[] = []
      for (const [uid, entry] of s.typingUsers) {
        if (uid !== userId) out.push(entry.username)
      }
      return out.length > 4 ? out.slice(0, 4) : out
    })
  )

  const [dmTypingUsers, setDmTypingUsers] = useState<string[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const userIdToNameRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!isDm) return
    const socket = getSocket()
    if (!socket) return
    const timers = timersRef.current
    const userIdToName = userIdToNameRef.current

    const removeUser = (uid: string) => {
      const name = userIdToName.get(uid)
      if (!name) return
      const t = timers.get(uid)
      if (t) clearTimeout(t)
      timers.delete(uid)
      userIdToName.delete(uid)
      setDmTypingUsers((prev) => prev.filter((u) => u !== name))
    }

    const onTyping = (payload: { conversationId: string; userId: string; username: string }) => {
      if (payload.conversationId !== contextId) return
      userIdToName.set(payload.userId, payload.username)
      setDmTypingUsers((prev) => (prev.includes(payload.username) ? prev : [...prev, payload.username]))
      const prev = timers.get(payload.userId)
      if (prev) clearTimeout(prev)
      timers.set(
        payload.userId,
        setTimeout(() => removeUser(payload.userId), 3000)
      )
    }
    const onTypingStop = (payload: { conversationId: string; userId: string }) => {
      if (payload.conversationId !== contextId) return
      removeUser(payload.userId)
    }
    socket.on('dm:typing', onTyping)
    socket.on('dm:typing-stop', onTypingStop)
    return () => {
      socket.off('dm:typing', onTyping)
      socket.off('dm:typing-stop', onTypingStop)
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      userIdToName.clear()
      setDmTypingUsers([])
    }
  }, [isDm, contextId])

  return isDm ? dmTypingUsers : channelTypingNames
}

export function formatTyping(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}
