/// <reference types="jest" />
import { useNavigationStore as coordinator } from '@/stores/navigation.store'
import { parseConversationPath, type ConversationOutcome } from '@/lib/conversationTarget'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useServerStore } from '@/stores/server.store'

/** A committed Router for the existing cache/race journeys. No production bypass. */
beforeEach(() => {
  coordinator.getState().reset()
  let sequence = 0
  coordinator.getState().bindRouter((path, options) => {
    const request = parseConversationPath(path)
    if (!request) throw new Error('Invalid conversation test route')
    const key = `conversation-test-${++sequence}`
    window.history.replaceState({ key }, '', path)
    const state = options?.state as { conversationRequestId?: number } | undefined
    void coordinator.getState().enterRoute(request, {
      key,
      requestId: state?.conversationRequestId,
      isCurrent: () => window.history.state?.key === key
    })
  })
})

const pathResult = (result: ConversationOutcome) => (result.status === 'opened' ? result.path : null)
export const useNavigationStore = {
  setState: coordinator.setState,
  subscribe: coordinator.subscribe,
  getState: () => {
    const state = coordinator.getState()
    return {
      ...state,
      error: state.error ? { ...state.error, retry: async () => pathResult(await state.error!.retry()) } : null,
      navigateToChannel: async ({
        serverId,
        channelId,
        scrollToMessageId
      }: {
        serverId: string
        channelId?: string | null
        scrollToMessageId?: string | null
      }) => {
        const same =
          useServerStore.getState().viewMode === 'server' &&
          useServerStore.getState().currentServerId === serverId &&
          channelId === useChannelStore.getState().currentChannelId
        const result = await state.openConversation({
          target: channelId ? { kind: 'channel', serverId, channelId } : { kind: 'server', serverId },
          position: scrollToMessageId ? { kind: 'message', messageId: scrollToMessageId } : { kind: 'unread' }
        })
        return same ? null : pathResult(result)
      },
      navigateToDm: async ({
        conversationId,
        scrollToMessageId
      }: {
        conversationId: string
        scrollToMessageId?: string | null
      }) => {
        const same =
          useServerStore.getState().viewMode === 'dm' && useDmStore.getState().currentConversationId === conversationId
        const result = await state.openConversation({
          target: { kind: 'dm', conversationId },
          position: scrollToMessageId ? { kind: 'message', messageId: scrollToMessageId } : { kind: 'unread' }
        })
        return same ? null : pathResult(result)
      }
    }
  }
}
