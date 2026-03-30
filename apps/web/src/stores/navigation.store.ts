import { create } from 'zustand'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useMemberStore } from './member.store'
import { useMessageStore } from './message.store'
import { useServerStore } from './server.store'
import { getSocket } from '@/lib/socket'

type NavigationState = {
  isNavigating: boolean
  navigatingToServerId: string | null
  activeNavId: number
  navigateToChannel: (opts: {
    serverId: string
    channelId?: string | null
    scrollToMessageId?: string | null
  }) => Promise<string | null>
  navigateToDm: (opts: { conversationId: string; scrollToMessageId?: string | null }) => Promise<string | null>
}

let navCounter = 0

export const useNavigationStore = create<NavigationState>((set, get) => ({
  isNavigating: false,
  navigatingToServerId: null,
  activeNavId: 0,

  navigateToChannel: async ({ serverId, channelId, scrollToMessageId }) => {
    const navId = ++navCounter
    const currentServerId = useServerStore.getState().currentServerId
    const serverChanged = currentServerId !== serverId

    set({ isNavigating: true, activeNavId: navId, navigatingToServerId: serverChanged ? serverId : null })

    try {
      if (serverChanged) {
        await Promise.all([
          useChannelStore.getState().fetchChannels(serverId),
          useMemberStore.getState().fetchMembers(serverId),
          useChannelPermissionsStore.getState().fetchChannelPermissions(serverId)
        ])
        if (get().activeNavId !== navId) return null
      }

      const channels = useChannelStore.getState().channels
      let targetChannelId = channelId ?? null
      if (!targetChannelId || !channels.some((c) => c.id === targetChannelId)) {
        const firstText = channels.filter((c) => c.type === 'text').sort((a, b) => a.position - b.position)[0]
        targetChannelId = firstText?.id ?? null
      }

      if (!targetChannelId) {
        set({ isNavigating: false, navigatingToServerId: null })
        return `/channels/${serverId}`
      }

      const oldChannelId = useChannelStore.getState().currentChannelId
      const inServerView = useServerStore.getState().viewMode === 'server'
      const sameChannel = inServerView && !serverChanged && targetChannelId === oldChannelId

      if (sameChannel) {
        if (scrollToMessageId) {
          const msgs = useMessageStore.getState().messages
          if (!msgs.some((m) => m.id === scrollToMessageId)) {
            await useMessageStore.getState().fetchMessagesAround(targetChannelId, scrollToMessageId)
            if (get().activeNavId !== navId) return null
          }
          useMessageStore.getState().setScrollToMessageId(scrollToMessageId)
        }
        set({ isNavigating: false, navigatingToServerId: null })
        return null
      }

      const socket = getSocket()
      if (oldChannelId && oldChannelId !== targetChannelId) {
        socket?.emit('channel:leave', { channelId: oldChannelId })
      }
      socket?.emit('channel:join', { channelId: targetChannelId })

      useMessageStore.getState().clearMessages()
      if (scrollToMessageId) {
        await useMessageStore.getState().fetchMessagesAround(targetChannelId, scrollToMessageId)
      } else {
        await useMessageStore.getState().fetchMessages(targetChannelId)
      }

      if (get().activeNavId !== navId) return null

      if (scrollToMessageId) {
        useMessageStore.getState().setScrollToMessageId(scrollToMessageId)
      }

      useServerStore.getState().setCurrentServer(serverId)
      useChannelStore.getState().setCurrentChannel(targetChannelId)

      set({ isNavigating: false, navigatingToServerId: null })
      return `/channels/${serverId}/${targetChannelId}`
    } catch {
      if (get().activeNavId === navId) {
        set({ isNavigating: false, navigatingToServerId: null })
      }
      return null
    }
  },

  navigateToDm: async ({ conversationId, scrollToMessageId }) => {
    const navId = ++navCounter
    set({ isNavigating: true, activeNavId: navId, navigatingToServerId: null })

    try {
      const dmState = useDmStore.getState()
      const inDmView = useServerStore.getState().viewMode === 'dm'
      const sameConv = inDmView && dmState.currentConversationId === conversationId

      if (sameConv) {
        if (scrollToMessageId) {
          const alreadyHas = dmState.messages.some((m) => m.id === scrollToMessageId)
          if (!alreadyHas) {
            await useDmStore.getState().fetchMessagesAround(conversationId, scrollToMessageId)
            if (get().activeNavId !== navId) return null
          }
          useDmStore.getState().setScrollToMessageId(scrollToMessageId)
        }
        set({ isNavigating: false })
        return null
      }

      useDmStore.getState().clearMessages()
      if (scrollToMessageId) {
        await useDmStore.getState().fetchMessagesAround(conversationId, scrollToMessageId)
      } else {
        await useDmStore.getState().fetchMessages(conversationId)
      }

      if (get().activeNavId !== navId) return null

      if (scrollToMessageId) {
        useDmStore.getState().setScrollToMessageId(scrollToMessageId)
      }

      useServerStore.getState().setViewMode('dm')
      useDmStore.getState().setCurrentConversation(conversationId)

      set({ isNavigating: false })
      return `/channels/@me/${conversationId}`
    } catch {
      if (get().activeNavId === navId) {
        set({ isNavigating: false })
      }
      return null
    }
  }
}))
