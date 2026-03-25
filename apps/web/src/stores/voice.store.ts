import { create } from 'zustand'

export type VoiceParticipant = {
  userId: string
  username: string
  muted?: boolean
  deafened?: boolean
  camera?: boolean
  screenShare?: boolean
}

type VoiceState = {
  /** channelId -> participants */
  participants: Record<string, VoiceParticipant[]>

  setAll: (state: Record<string, VoiceParticipant[]>) => void
  addParticipant: (channelId: string, participant: VoiceParticipant) => void
  removeParticipant: (channelId: string, userId: string) => void
  updateParticipantState: (
    channelId: string,
    userId: string,
    state: Partial<Pick<VoiceParticipant, 'muted' | 'deafened' | 'camera' | 'screenShare'>>
  ) => void
  reset: () => void
}

export const useVoiceStore = create<VoiceState>((set) => ({
  participants: {},

  setAll: (state) => set({ participants: state }),

  addParticipant: (channelId, participant) =>
    set((s) => {
      const list = s.participants[channelId] ?? []
      if (list.some((p) => p.userId === participant.userId)) return s
      return {
        participants: {
          ...s.participants,
          [channelId]: [...list, participant]
        }
      }
    }),

  removeParticipant: (channelId, userId) =>
    set((s) => {
      const list = s.participants[channelId]
      if (!list) return s
      const filtered = list.filter((p) => p.userId !== userId)
      const next = { ...s.participants }
      if (filtered.length === 0) {
        delete next[channelId]
      } else {
        next[channelId] = filtered
      }
      return { participants: next }
    }),

  updateParticipantState: (channelId, userId, state) =>
    set((s) => {
      const list = s.participants[channelId]
      if (!list) return s
      return {
        participants: {
          ...s.participants,
          [channelId]: list.map((p) => (p.userId === userId ? { ...p, ...state } : p))
        }
      }
    }),

  reset: () => set({ participants: {} })
}))
