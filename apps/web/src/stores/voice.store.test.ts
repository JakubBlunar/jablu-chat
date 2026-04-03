import { useVoiceStore } from './voice.store'

function resetStore() {
  useVoiceStore.setState({ participants: {} })
}

beforeEach(() => {
  resetStore()
})

describe('voice.store', () => {
  describe('setAll', () => {
    it('replaces all participants', () => {
      useVoiceStore.getState().setAll({
        vc1: [{ userId: 'u1', username: 'alice' }],
        vc2: [{ userId: 'u2', username: 'bob' }]
      })

      expect(Object.keys(useVoiceStore.getState().participants)).toHaveLength(2)
    })
  })

  describe('addParticipant', () => {
    it('adds a participant to a channel', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      expect(useVoiceStore.getState().participants.vc1).toHaveLength(1)
      expect(useVoiceStore.getState().participants.vc1[0].userId).toBe('u1')
    })

    it('creates channel entry if it does not exist', () => {
      useVoiceStore.getState().addParticipant('new-vc', { userId: 'u1', username: 'alice' })

      expect(useVoiceStore.getState().participants['new-vc']).toBeDefined()
    })

    it('does not add duplicate participants', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      expect(useVoiceStore.getState().participants.vc1).toHaveLength(1)
    })
  })

  describe('removeParticipant', () => {
    it('removes a participant from a channel', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u2', username: 'bob' })

      useVoiceStore.getState().removeParticipant('vc1', 'u1')

      expect(useVoiceStore.getState().participants.vc1).toHaveLength(1)
      expect(useVoiceStore.getState().participants.vc1[0].userId).toBe('u2')
    })

    it('removes channel key when last participant leaves', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      useVoiceStore.getState().removeParticipant('vc1', 'u1')

      expect(useVoiceStore.getState().participants.vc1).toBeUndefined()
    })

    it('is a no-op for non-existent channel', () => {
      const before = useVoiceStore.getState().participants
      useVoiceStore.getState().removeParticipant('missing', 'u1')

      expect(useVoiceStore.getState().participants).toBe(before)
    })
  })

  describe('updateParticipantState', () => {
    it('updates muted state', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      useVoiceStore.getState().updateParticipantState('vc1', 'u1', { muted: true })

      expect(useVoiceStore.getState().participants.vc1[0].muted).toBe(true)
    })

    it('updates multiple state fields', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      useVoiceStore.getState().updateParticipantState('vc1', 'u1', {
        deafened: true,
        camera: true,
        screenShare: false
      })

      const p = useVoiceStore.getState().participants.vc1[0]
      expect(p.deafened).toBe(true)
      expect(p.camera).toBe(true)
      expect(p.screenShare).toBe(false)
    })

    it('is a no-op for non-existent channel', () => {
      const before = useVoiceStore.getState().participants
      useVoiceStore.getState().updateParticipantState('missing', 'u1', { muted: true })

      expect(useVoiceStore.getState().participants).toBe(before)
    })
  })

  describe('reset', () => {
    it('clears all participants', () => {
      useVoiceStore.getState().addParticipant('vc1', { userId: 'u1', username: 'alice' })

      useVoiceStore.getState().reset()

      expect(useVoiceStore.getState().participants).toEqual({})
    })
  })
})
