import type { BotCommandWithBot } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export function useBotCommands(
  serverId: string | null,
  channelId: string | null | undefined,
  botUserId: string | null | undefined
): BotCommandWithBot[] {
  const cacheKey = serverId && channelId
    ? `${serverId}:${channelId}`
    : botUserId
      ? `dm:${botUserId}`
      : null
  const cacheRef = useRef<{ key: string; commands: BotCommandWithBot[] } | null>(null)
  const [commands, setCommands] = useState<BotCommandWithBot[]>([])

  const refetch = useCallback(async () => {
    if (!cacheKey) return
    try {
      const next = serverId
        ? await api.getServerBotCommands(serverId, channelId ?? undefined)
        : botUserId
          ? await api.getBotUserCommands(botUserId)
          : []
      cacheRef.current = { key: cacheKey, commands: next }
      setCommands(next)
    } catch {
      cacheRef.current = { key: cacheKey, commands: [] }
      setCommands([])
    }
  }, [cacheKey, serverId, channelId, botUserId])

  useEffect(() => {
    if (!cacheKey) {
      cacheRef.current = null
      setCommands([])
      return
    }
    if (cacheRef.current?.key === cacheKey) {
      setCommands(cacheRef.current.commands)
      return
    }
    void refetch()
  }, [cacheKey, refetch])

  useEffect(() => {
    const socket = getSocket()
    if (!socket || !serverId) return
    const handler = (data: { serverId?: string }) => {
      if (data.serverId && data.serverId !== serverId) return
      void refetch()
    }
    socket.on('bot:commands-updated', handler)
    return () => { socket.off('bot:commands-updated', handler) }
  }, [serverId, refetch])

  return commands
}
