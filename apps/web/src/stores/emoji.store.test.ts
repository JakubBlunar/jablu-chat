import { useEmojiStore } from './emoji.store'

jest.mock('@/lib/api', () => ({
  api: {
    getEmojis: jest.fn(),
  }
}))

import { api } from '@/lib/api'
const mockGetEmojis = jest.mocked(api.getEmojis)

function resetStore() {
  useEmojiStore.setState({ byServer: {} })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('emoji.store', () => {
  describe('fetch', () => {
    it('stores emojis by serverId', async () => {
      mockGetEmojis.mockResolvedValue([
        { id: 'e1', name: 'wave', url: '/emoji/wave.webp' }
      ] as any)

      await useEmojiStore.getState().fetch('s1')

      expect(useEmojiStore.getState().byServer.s1).toHaveLength(1)
      expect(useEmojiStore.getState().byServer.s1[0].name).toBe('wave')
    })

    it('does not throw on fetch failure', async () => {
      mockGetEmojis.mockRejectedValue(new Error('network'))

      await expect(useEmojiStore.getState().fetch('s1')).resolves.toBeUndefined()
    })
  })

  describe('getForServer', () => {
    it('returns emojis for a server', () => {
      useEmojiStore.setState({
        byServer: { s1: [{ id: 'e1', name: 'wave' }] as any }
      })

      expect(useEmojiStore.getState().getForServer('s1')).toHaveLength(1)
    })

    it('returns empty array for unknown server', () => {
      expect(useEmojiStore.getState().getForServer('unknown')).toEqual([])
    })
  })

  describe('findByName', () => {
    beforeEach(() => {
      useEmojiStore.setState({
        byServer: {
          s1: [
            { id: 'e1', name: 'Wave' },
            { id: 'e2', name: 'ThumbsUp' }
          ] as any
        }
      })
    })

    it('finds emoji by name (case-insensitive)', () => {
      expect(useEmojiStore.getState().findByName('s1', 'wave')?.id).toBe('e1')
      expect(useEmojiStore.getState().findByName('s1', 'WAVE')?.id).toBe('e1')
    })

    it('returns undefined for non-existent emoji', () => {
      expect(useEmojiStore.getState().findByName('s1', 'missing')).toBeUndefined()
    })

    it('returns undefined for unknown server', () => {
      expect(useEmojiStore.getState().findByName('unknown', 'wave')).toBeUndefined()
    })
  })

  describe('getNameMap', () => {
    it('returns a Map of lowercase name to emoji', () => {
      useEmojiStore.setState({
        byServer: {
          s1: [
            { id: 'e1', name: 'Wave' },
            { id: 'e2', name: 'Fire' }
          ] as any
        }
      })

      const map = useEmojiStore.getState().getNameMap('s1')

      expect(map.size).toBe(2)
      expect(map.get('wave')?.id).toBe('e1')
      expect(map.get('fire')?.id).toBe('e2')
    })

    it('returns empty Map for unknown server', () => {
      expect(useEmojiStore.getState().getNameMap('unknown').size).toBe(0)
    })
  })
})
