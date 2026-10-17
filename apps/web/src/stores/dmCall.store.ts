import { create } from 'zustand'
import type { DmCall, DmCallEndReason, DmCallReply } from '@chat/shared'
import { api } from '@/lib/api'
import { getDmDisplayInfo } from '@/lib/dmDisplay'
import { getSocket } from '@/lib/socket'
import { joinDmCall } from '@/lib/voiceConnect'
import { useAuthStore } from './auth.store'
import { useDmStore } from './dm.store'
import { useVoiceConnectionStore } from './voice-connection.store'
import { useVoiceStore } from './voice.store'

export async function requestDmCall<T>(event: string, payload: object = {}): Promise<T> {
  const socket = getSocket()
  if (!socket?.connected) throw new Error('Not connected. Please reconnect before calling.')
  const reply: DmCallReply<T> = await socket.timeout(8000).emitWithAck(event, payload)
  if (!reply.ok) throw new Error(reply.error)
  return reply.data
}

type DmCallState = {
  calls: Record<string, DmCall>
  busy: boolean
  error: string | null
  syncStatus: 'idle' | 'loading' | 'ready' | 'error'
  update: (call: DmCall) => void
  ended: (event: { callId: string; reason: DmCallEndReason }) => void
  sync: () => Promise<void>
  start: (conversationId: string) => Promise<boolean>
  accept: (call: DmCall) => Promise<boolean>
  decline: (callId: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

let generation = 0

async function connect(call: DmCall, isValid: () => boolean): Promise<boolean> {
  let conversation = useDmStore.getState().conversations.find((c) => c.id === call.conversationId)
  if (!conversation) {
    conversation = await api.getDmConversation(call.conversationId)
    if (!isValid()) return false
    useDmStore.getState().addOrUpdateConversation(conversation)
  }
  const { name } = getDmDisplayInfo(conversation, useAuthStore.getState().user?.id)
  if (!isValid()) return false
  await joinDmCall(call.id, call.conversationId, name, isValid)
  if (!isValid()) return false
  if (useVoiceConnectionStore.getState().currentDmCallId !== call.id || !useVoiceConnectionStore.getState().room) {
    throw new Error('Could not connect to the call')
  }
  return true
}

async function leaveCurrentVoice() {
  const voice = useVoiceConnectionStore.getState()
  if (voice.currentDmCallId) await requestDmCall('dm:call:leave', { callId: voice.currentDmCallId })
  if (voice.currentChannelId) {
    getSocket()?.emit('voice:leave')
    voice.disconnect()
  }
}

export const useDmCallStore = create<DmCallState>((set, get) => ({
  calls: {},
  busy: false,
  error: null,
  syncStatus: 'idle',
  update: (call) => {
    set((s) => ({ calls: { ...s.calls, [call.id]: call } }))
    useVoiceStore.setState((s) => ({ participants: { ...s.participants, [call.conversationId]: call.participants } }))
  },
  ended: ({ callId, reason }) => {
    const call = get().calls[callId]
    if (call) {
      for (const participant of call.participants)
        useVoiceStore.getState().removeParticipant(call.conversationId, participant.userId)
    }
    set((s) => {
      const calls = { ...s.calls }
      delete calls[callId]
      return {
        calls,
        error:
          call?.callerId === useAuthStore.getState().user?.id && (reason === 'declined' || reason === 'timeout')
            ? reason === 'declined'
              ? 'Call declined'
              : 'No answer'
            : s.error
      }
    })
    if (useVoiceConnectionStore.getState().currentDmCallId === callId) useVoiceConnectionStore.getState().disconnect()
  },
  sync: async () => {
    if (get().syncStatus === 'loading') return
    const epoch = generation
    set({ syncStatus: 'loading' })
    try {
      const calls = await requestDmCall<DmCall[]>('dm:call:sync')
      if (epoch !== generation) return
      set((state) => ({
        calls: Object.fromEntries(calls.map((call) => [call.id, call])),
        syncStatus: 'ready',
        error: state.error === 'Could not load active calls' ? null : state.error
      }))
    } catch (error) {
      console.error('Failed to synchronize DM calls:', error)
      if (epoch === generation) set({ error: 'Could not load active calls', syncStatus: 'error' })
    }
  },
  start: async (conversationId) => {
    if (get().busy) return false
    const epoch = generation
    const socket = getSocket()
    set({ busy: true, error: null })
    let call: DmCall | undefined
    try {
      await leaveCurrentVoice()
      if (epoch !== generation) return false
      call = await requestDmCall<DmCall>('dm:call:start', { conversationId })
      if (epoch !== generation) {
        socket?.emit('dm:call:leave', { callId: call.id })
        return false
      }
      get().update(call)
      const callId = call.id
      return await connect(call, () => epoch === generation && !!get().calls[callId])
    } catch (error) {
      if (call) {
        socket?.emit('dm:call:leave', { callId: call.id })
        if (epoch === generation) get().ended({ callId: call.id, reason: 'hangup' })
      }
      console.error('Failed to start DM call:', error)
      if (epoch === generation) set({ error: error instanceof Error ? error.message : 'Could not start call' })
      return false
    } finally {
      if (epoch === generation) set({ busy: false })
    }
  },
  accept: async (call) => {
    if (get().busy) return false
    const epoch = generation
    const socket = getSocket()
    set({ busy: true, error: null })
    let accepted = false
    try {
      await leaveCurrentVoice()
      if (epoch !== generation) return false
      const updated = await requestDmCall<DmCall>('dm:call:accept', { callId: call.id })
      accepted = true
      if (epoch !== generation) {
        socket?.emit('dm:call:leave', { callId: call.id })
        return false
      }
      get().update(updated)
      return await connect(updated, () => epoch === generation && !!get().calls[updated.id])
    } catch (error) {
      if (accepted) {
        socket?.emit('dm:call:leave', { callId: call.id })
        if (epoch === generation) get().ended({ callId: call.id, reason: 'hangup' })
      }
      console.error('Failed to accept DM call:', error)
      if (epoch === generation) set({ error: error instanceof Error ? error.message : 'Could not accept call' })
      return false
    } finally {
      if (epoch === generation) set({ busy: false })
    }
  },
  decline: async (callId) => {
    const epoch = generation
    try {
      await requestDmCall('dm:call:decline', { callId })
    } catch (error) {
      console.error('Failed to decline DM call:', error)
      if (epoch === generation) set({ error: error instanceof Error ? error.message : 'Could not decline call' })
    }
  },
  clearError: () => set({ error: null }),
  reset: () => {
    generation++
    if (useVoiceConnectionStore.getState().currentDmCallId) useVoiceConnectionStore.getState().disconnect()
    set({ calls: {}, busy: false, error: null, syncStatus: 'idle' })
  }
}))
