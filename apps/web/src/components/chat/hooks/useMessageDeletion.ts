import type { Message } from '@chat/shared'
import { useRef, useState } from 'react'
import { deleteMessage } from '@/lib/messageActions'
import { messageActionError } from '@/lib/messageActionError'

export function useMessageDeletion(mode: 'channel' | 'dm', contextId: string, message: Message, onDeleted: () => void) {
  const active = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    if (active.current) return
    active.current = true
    setPending(true)
    setError(null)
    try {
      await deleteMessage(mode, contextId, message)
      onDeleted()
    } catch (error) {
      console.error('Could not delete message', error)
      setError(messageActionError(error))
    } finally {
      active.current = false
      setPending(false)
    }
  }

  return { pending, error, confirm }
}
