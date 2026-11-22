import { openConversation } from './conversationNavigation'
import { useLayoutStore } from '@/stores/layout.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export async function returnToVoiceRoom() {
  const { currentChannelId, currentDmCallId, currentServerId } = useVoiceConnectionStore.getState()
  if (!currentChannelId || (!currentDmCallId && !currentServerId)) return
  const target = currentDmCallId
    ? { kind: 'dm' as const, conversationId: currentChannelId }
    : { kind: 'channel' as const, serverId: currentServerId!, channelId: currentChannelId }
  const outcome = await openConversation({ target, source: 'sidebar' })
  const voice = useVoiceConnectionStore.getState()
  if (
    outcome.status !== 'opened' ||
    voice.currentChannelId !== currentChannelId ||
    voice.currentDmCallId !== currentDmCallId
  )
    return
  voice.setViewingVoiceRoom(true)
  useLayoutStore.getState().closeNavDrawer()
}

export function openCallAudioSettings() {
  window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'voice', returnToCaller: true } }))
}
