import { useCallback, useEffect, useMemo, useState } from 'react'
import { type MentionChannel } from '@/components/chat/ChatInputBar'
import { type ChannelRef } from '@/components/MarkdownContent'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'

export function useDmContext(isDm: boolean, userId: string | undefined) {
  const dmConversations = useDmStore((s) => s.conversations)
  const dmConvId = useDmStore((s) => s.currentConversationId)
  const currentConv = useMemo(
    () => (isDm ? (dmConversations.find((c) => c.id === dmConvId) ?? null) : null),
    [isDm, dmConversations, dmConvId]
  )

  const allChannels = useChannelStore((s) => s.channels)
  const serverChannelRefs: ChannelRef[] = useMemo(
    () => allChannels.filter((c) => c.type === 'text').map((c) => ({ id: c.id, serverId: c.serverId, name: c.name })),
    [allChannels]
  )

  const otherMember = useMemo(() => {
    if (!currentConv || currentConv.isGroup) return null
    return currentConv.members.find((m) => m.userId !== userId) ?? null
  }, [currentConv, userId])

  const [mutualServers, setMutualServers] = useState<
    { id: string; name: string; iconUrl: string | null; channels: { id: string; name: string }[] }[]
  >([])
  useEffect(() => {
    if (!isDm || !otherMember) {
      setMutualServers([])
      return
    }
    let cancelled = false
    api
      .getMutualServers(otherMember.userId)
      .then((res) => {
        if (!cancelled) setMutualServers(res.servers)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isDm, otherMember?.userId])

  const dmChannelRefs: ChannelRef[] = useMemo(
    () => mutualServers.flatMap((s) => s.channels.map((c) => ({ id: c.id, serverId: s.id, name: c.name }))),
    [mutualServers]
  )

  const channelRefs = isDm ? dmChannelRefs : serverChannelRefs

  const [showProfile, setShowProfile] = useState(false)
  const otherName = otherMember?.displayName ?? otherMember?.username ?? 'Unknown'

  const { orchestratedGoToChannel } = useAppNavigate()
  const handleChannelClick = useCallback(
    (serverId: string, chId: string) => void orchestratedGoToChannel(serverId, chId),
    [orchestratedGoToChannel]
  )

  return {
    dmConvId,
    currentConv,
    otherMember,
    mutualServers,
    channelRefs,
    showProfile,
    setShowProfile,
    otherName,
    handleChannelClick
  }
}

export function dmMentionChannels(
  mutualServers: { id: string; name: string; channels: { id: string; name: string }[] }[]
): MentionChannel[] {
  return mutualServers.flatMap((s) =>
    s.channels.map((c) => ({ id: c.id, serverId: s.id, name: c.name, serverName: s.name }))
  )
}
