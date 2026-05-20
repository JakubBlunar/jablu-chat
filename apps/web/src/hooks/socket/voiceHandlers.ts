import { playJoinSound, playLeaveSound } from '@/lib/sounds'
import { joinVoiceChannel } from '@/lib/voiceConnect'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useVoiceStore, type VoiceParticipant } from '@/stores/voice.store'

export function createVoiceHandlers() {
  const onVoiceParticipants = (state: Record<string, VoiceParticipant[]>) => {
    useVoiceStore.getState().setAll(state)
  }

  const onVoiceParticipantJoined = (payload: { channelId: string; userId: string; username: string }) => {
    useVoiceStore.getState().addParticipant(payload.channelId, {
      userId: payload.userId,
      username: payload.username
    })
    const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId
    const myId = useAuthStore.getState().user?.id
    if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
      playJoinSound()
    }
  }

  const onVoiceParticipantLeft = (payload: { channelId: string; userId: string }) => {
    useVoiceStore.getState().removeParticipant(payload.channelId, payload.userId)
    const myVoiceChannel = useVoiceConnectionStore.getState().currentChannelId
    const myId = useAuthStore.getState().user?.id
    if (myVoiceChannel === payload.channelId && payload.userId !== myId) {
      playLeaveSound()
    }
  }

  const onVoiceParticipantState = (payload: {
    channelId: string
    userId: string
    muted?: boolean
    deafened?: boolean
    camera?: boolean
    screenShare?: boolean
  }) => {
    const update: Partial<Pick<VoiceParticipant, 'muted' | 'deafened' | 'camera' | 'screenShare'>> = {}
    if (payload.muted !== undefined) update.muted = payload.muted
    if (payload.deafened !== undefined) update.deafened = payload.deafened
    if (payload.camera !== undefined) update.camera = payload.camera
    if (payload.screenShare !== undefined) update.screenShare = payload.screenShare

    useVoiceStore.getState().updateParticipantState(payload.channelId, payload.userId, update)
  }

  const onVoiceMoved = (payload: { userId: string; fromChannelId: string; toChannelId: string }) => {
    const myId = useAuthStore.getState().user?.id
    if (payload.userId !== myId) return

    const vc = useVoiceConnectionStore.getState()
    if (!vc.currentServerId) return

    const ch = useChannelStore.getState().channels.find((c) => c.id === payload.toChannelId)
    joinVoiceChannel(vc.currentServerId, payload.toChannelId, ch?.name ?? 'AFK')
  }

  return {
    onVoiceParticipants,
    onVoiceParticipantJoined,
    onVoiceParticipantLeft,
    onVoiceParticipantState,
    onVoiceMoved
  }
}
