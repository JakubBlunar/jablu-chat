import type { Channel } from '@chat/shared'
import { create } from 'zustand'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useEmojiStore } from './emoji.store'
import { useMemberStore } from './member.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useServerStore } from './server.store'
import { hydrateContextFromDisk } from '@/lib/cache/hydrate'
import { channelKey, dmKey, peekContext } from '@/lib/cache/messageCache'
import { getSocket } from '@/lib/socket'
import { historyErrorKey, type HistoryErrorKey } from '@/lib/messageHistory'

/** Channel types that have a message history worth navigating to. */
function isMessageable(channel: Channel | undefined): boolean {
  return channel ? channel.type === 'text' || channel.type === 'forum' : true
}

/**
 * Resolve which channel a server switch should land on: an explicit request,
 * then the channel the user last read here, then the first text channel.
 *
 * Archived channels are excluded from the fallback to agree with
 * `useSortedChannels`, which MainLayout's redirect effect uses.
 */
function resolveTargetChannel(serverId: string, channels: Channel[], requested?: string | null): string | null {
  const exists = (id: string | null | undefined) => !!id && channels.some((c) => c.id === id)

  if (exists(requested)) return requested!

  const remembered = useNavHistoryStore.getState().getLastChannel(serverId)
  if (exists(remembered)) return remembered

  const firstText = channels
    .filter((c) => c.type === 'text' && !c.isArchived)
    .sort((a, b) => a.position - b.position)[0]
  return firstText?.id ?? null
}

type NavigationState = {
  isNavigating: boolean
  navigatingToServerId: string | null
  activeNavId: number
  error: { key: HistoryErrorKey; retry: () => Promise<string | null> } | null
  dismissError: () => void
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
  error: null,
  dismissError: () => set({ error: null }),

  navigateToChannel: async ({ serverId, channelId, scrollToMessageId }) => {
    const navId = ++navCounter
    const currentServerId = useServerStore.getState().currentServerId
    const serverChanged = currentServerId !== serverId

    set({ isNavigating: true, error: null, activeNavId: navId, navigatingToServerId: serverChanged ? serverId : null })

    try {
      const channelState = useChannelStore.getState()
      const requestedMissing = !!channelId && !channelState.channels.some((c) => c.id === channelId)
      if (serverChanged || channelState.loadedServerId !== serverId || requestedMissing) {
        // Only the channel list and permissions decide what renders first.
        // Members fill a side panel and emojis only matter once the picker is
        // opened, so awaiting them here just delays the switch. Nothing awaits
        // these, so a rejection has nowhere to go but an unhandled rejection.
        void Promise.resolve(useMemberStore.getState().fetchMembers(serverId)).catch(() => {})
        void Promise.resolve(useEmojiStore.getState().fetch(serverId)).catch(() => {})

        const sidebarReady =
          !requestedMissing &&
          useChannelStore.getState().hydrateFromCache(serverId) &&
          useChannelPermissionsStore.getState().hydrateFromCache(serverId)

        const revalidate = Promise.all([
          useChannelStore.getState().fetchChannels(serverId),
          useChannelPermissionsStore.getState().fetchChannelPermissions(serverId)
        ])

        if (sidebarReady) {
          // Everything needed to pick and render a channel is already on
          // screen, so the refresh happens behind the user.
          void revalidate.catch(() => {})
        } else {
          await revalidate
          if (get().activeNavId !== navId) return null
        }
      }

      const channels = useChannelStore.getState().channels
      if (channelId && !channels.some((c) => c.id === channelId && c.serverId === serverId)) {
        throw new Error('messageUnavailable')
      }
      const targetChannelId = resolveTargetChannel(serverId, channels, channelId)

      if (!targetChannelId) {
        useNavHistoryStore.getState().recordServerLocation(serverId, null)
        set({ isNavigating: false, navigatingToServerId: null })
        return `/channels/${serverId}`
      }

      // Voice channels don't have a message history. The server returns 403
      // for /api/channels/{id}/messages on non-text/forum channels, so we
      // skip the pre-fetch entirely. MainLayout will render the VoiceRoom
      // when viewingVoiceRoom is true (set by the caller, e.g. the "Voice
      // Connected" pill in MobileNavDrawer) and MessageArea never mounts.
      const targetChannel = channels.find((c) => c.id === targetChannelId)
      const targetIsMessageable = isMessageable(targetChannel)

      const oldChannelId = useChannelStore.getState().currentChannelId
      const inServerView = useServerStore.getState().viewMode === 'server'
      const sameChannel = inServerView && !serverChanged && targetChannelId === oldChannelId

      // URL sync can select the destination before its history has loaded.
      // Only reuse an already selected channel when its message window is ready.
      if (sameChannel && (!targetIsMessageable || useMessageStore.getState().loadedForChannelId === targetChannelId)) {
        if (scrollToMessageId && targetIsMessageable) {
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

      // No `channel:leave`: the gateway subscribes the socket to every visible
      // channel on connect, and staying subscribed is what keeps cached
      // channels correct while the user is looking elsewhere.
      getSocket()?.emit('channel:join', { channelId: targetChannelId })

      if (targetIsMessageable) {
        // Hand the channel being left to the cache before overwriting it.
        useMessageStore.getState().stashCurrent()

        // A jump to a specific message needs a window around it, which the
        // cached tail cannot satisfy, so that path always fetches.
        if (!scrollToMessageId) {
          // One indexed lookup, not a round trip. Skipped entirely when the
          // context is already resident in memory.
          await hydrateContextFromDisk(channelKey(targetChannelId))
          if (get().activeNavId !== navId) return null
        }

        // A copy that came off disk can have missed edits and deletions that
        // no socket event will ever replay, so it renders now and is checked
        // against the server behind the user.
        const wasStale = peekContext(channelKey(targetChannelId))?.stale ?? false
        const served = !scrollToMessageId && useMessageStore.getState().hydrateFromCache(targetChannelId)

        if (served && wasStale) {
          void useMessageStore.getState().revalidate(targetChannelId)
        }

        if (!served) {
          if (scrollToMessageId) {
            await useMessageStore.getState().fetchMessagesAround(targetChannelId, scrollToMessageId)
          } else {
            useMessageStore.getState().clearMessages()
            await useMessageStore.getState().fetchMessages(targetChannelId)
          }

          if (get().activeNavId !== navId) return null
        }

        if (scrollToMessageId) {
          useMessageStore.getState().setScrollToMessageId(scrollToMessageId)
        }
      }

      useServerStore.getState().setCurrentServer(serverId)
      useChannelStore.getState().setCurrentChannel(targetChannelId)

      // Only messageable channels are remembered, so neither a server switch
      // nor a relaunch drops the user straight into a voice room.
      if (targetIsMessageable) {
        useNavHistoryStore.getState().recordChannel(serverId, targetChannelId)
      }
      useNavHistoryStore.getState().recordServerLocation(serverId, targetIsMessageable ? targetChannelId : null)

      set({ isNavigating: false, navigatingToServerId: null })
      return `/channels/${serverId}/${targetChannelId}`
    } catch (error) {
      console.error('Failed to navigate to channel', error)
      if (get().activeNavId === navId) {
        set({
          isNavigating: false,
          navigatingToServerId: null,
          error: {
            key: historyErrorKey(error),
            retry: () => get().navigateToChannel({ serverId, channelId, scrollToMessageId })
          }
        })
      }
      return null
    }
  },

  navigateToDm: async ({ conversationId, scrollToMessageId }) => {
    const navId = ++navCounter
    set({ isNavigating: true, error: null, activeNavId: navId, navigatingToServerId: null })

    try {
      const dmState = useDmStore.getState()
      const inDmView = useServerStore.getState().viewMode === 'dm'
      const sameConv = inDmView && dmState.currentConversationId === conversationId

      if (sameConv && dmState.loadedForConvId === conversationId) {
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

      useDmStore.getState().stashCurrent()

      if (!scrollToMessageId) {
        await hydrateContextFromDisk(dmKey(conversationId))
        if (get().activeNavId !== navId) return null
      }

      const wasStale = peekContext(dmKey(conversationId))?.stale ?? false
      const served = !scrollToMessageId && useDmStore.getState().hydrateFromCache(conversationId)

      if (served && wasStale) {
        void useDmStore.getState().revalidate(conversationId)
      }

      if (!served) {
        if (scrollToMessageId) {
          await useDmStore.getState().fetchMessagesAround(conversationId, scrollToMessageId)
        } else {
          useDmStore.getState().clearMessages()
          await useDmStore.getState().fetchMessages(conversationId)
        }

        if (get().activeNavId !== navId) return null
        const error = useDmStore.getState().messagesError
        if (error) throw new Error(error)
      }

      if (scrollToMessageId) {
        useDmStore.getState().setScrollToMessageId(scrollToMessageId)
      }

      useServerStore.getState().setViewMode('dm')
      useDmStore.getState().setCurrentConversation(conversationId)
      useNavHistoryStore.getState().recordDmScreen(conversationId)

      set({ isNavigating: false })
      return `/channels/@me/${conversationId}`
    } catch (error) {
      console.error('Failed to navigate to conversation', error)
      if (get().activeNavId === navId) {
        set({
          isNavigating: false,
          error: {
            key: historyErrorKey(error),
            retry: () => get().navigateToDm({ conversationId, scrollToMessageId })
          }
        })
      }
      return null
    }
  }
}))
