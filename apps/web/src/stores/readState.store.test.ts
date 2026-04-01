import { useReadStateStore } from './readState.store'

jest.mock('@/lib/api', () => ({
  api: {
    getReadStates: jest.fn(),
    ackServer: jest.fn().mockReturnValue(Promise.resolve()),
    ackChannel: jest.fn().mockReturnValue(Promise.resolve()),
    ackDm: jest.fn().mockReturnValue(Promise.resolve())
  }
}))

import { api } from '@/lib/api'
const mockGetReadStates = jest.mocked(api.getReadStates)

function resetStore() {
  useReadStateStore.setState({
    channels: new Map(),
    dms: new Map(),
    channelToServer: new Map()
  })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('readState.store', () => {
  describe('fetchAll', () => {
    it('populates channels, dms, and channelToServer maps', async () => {
      mockGetReadStates.mockResolvedValueOnce({
        channels: [
          { channelId: 'ch-1', serverId: 's1', unreadCount: 3, mentionCount: 1, lastReadAt: '2025-01-01T00:00:00Z' },
          { channelId: 'ch-2', serverId: 's1', unreadCount: 0, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }
        ],
        dms: [
          { conversationId: 'dm-1', unreadCount: 2, mentionCount: 2, lastReadAt: '2025-01-01T00:00:00Z' }
        ]
      })

      await useReadStateStore.getState().fetchAll()

      const state = useReadStateStore.getState()
      expect(state.channels.size).toBe(2)
      expect(state.channels.get('ch-1')!.unreadCount).toBe(3)
      expect(state.dms.size).toBe(1)
      expect(state.dms.get('dm-1')!.mentionCount).toBe(2)
      expect(state.channelToServer.get('ch-1')).toBe('s1')
    })
  })

  describe('ackChannel', () => {
    it('zeros out unread and mention counts', () => {
      useReadStateStore.setState({
        channels: new Map([['ch-1', { unreadCount: 5, mentionCount: 2, lastReadAt: '2025-01-01T00:00:00Z' }]])
      })

      useReadStateStore.getState().ackChannel('ch-1')

      const rs = useReadStateStore.getState().channels.get('ch-1')!
      expect(rs.unreadCount).toBe(0)
      expect(rs.mentionCount).toBe(0)
    })
  })

  describe('ackServer', () => {
    it('zeros out all channels belonging to the server', () => {
      useReadStateStore.setState({
        channels: new Map([
          ['ch-1', { unreadCount: 3, mentionCount: 1, lastReadAt: '2025-01-01T00:00:00Z' }],
          ['ch-2', { unreadCount: 5, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }],
          ['ch-3', { unreadCount: 2, mentionCount: 2, lastReadAt: '2025-01-01T00:00:00Z' }]
        ]),
        channelToServer: new Map([['ch-1', 's1'], ['ch-2', 's1'], ['ch-3', 's2']])
      })

      useReadStateStore.getState().ackServer('s1')

      const state = useReadStateStore.getState()
      expect(state.channels.get('ch-1')!.unreadCount).toBe(0)
      expect(state.channels.get('ch-2')!.unreadCount).toBe(0)
      expect(state.channels.get('ch-3')!.unreadCount).toBe(2)
    })
  })

  describe('ackDm', () => {
    it('zeros out unread for the DM', () => {
      useReadStateStore.setState({
        dms: new Map([['dm-1', { unreadCount: 3, mentionCount: 3, lastReadAt: '2025-01-01T00:00:00Z' }]])
      })

      useReadStateStore.getState().ackDm('dm-1')

      expect(useReadStateStore.getState().dms.get('dm-1')!.unreadCount).toBe(0)
    })
  })

  describe('incrementChannel', () => {
    it('increments unread count', () => {
      useReadStateStore.setState({
        channels: new Map([['ch-1', { unreadCount: 1, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }]])
      })

      useReadStateStore.getState().incrementChannel('ch-1', false)
      expect(useReadStateStore.getState().channels.get('ch-1')!.unreadCount).toBe(2)
      expect(useReadStateStore.getState().channels.get('ch-1')!.mentionCount).toBe(0)
    })

    it('increments mention count when isMention is true', () => {
      useReadStateStore.setState({
        channels: new Map([['ch-1', { unreadCount: 0, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }]])
      })

      useReadStateStore.getState().incrementChannel('ch-1', true)
      expect(useReadStateStore.getState().channels.get('ch-1')!.mentionCount).toBe(1)
    })

    it('creates entry and records serverId for unknown channel', () => {
      useReadStateStore.getState().incrementChannel('ch-new', false, 's1')

      expect(useReadStateStore.getState().channels.get('ch-new')!.unreadCount).toBe(1)
      expect(useReadStateStore.getState().channelToServer.get('ch-new')).toBe('s1')
    })
  })

  describe('incrementDm', () => {
    it('increments both unread and mention for DMs', () => {
      useReadStateStore.setState({
        dms: new Map([['dm-1', { unreadCount: 0, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }]])
      })

      useReadStateStore.getState().incrementDm('dm-1')

      const rs = useReadStateStore.getState().dms.get('dm-1')!
      expect(rs.unreadCount).toBe(1)
      expect(rs.mentionCount).toBe(1)
    })
  })

  describe('getServerUnread', () => {
    beforeEach(() => {
      useReadStateStore.setState({
        channels: new Map([
          ['ch-1', { unreadCount: 5, mentionCount: 2, lastReadAt: '2025-01-01T00:00:00Z' }],
          ['ch-2', { unreadCount: 3, mentionCount: 0, lastReadAt: '2025-01-01T00:00:00Z' }],
          ['ch-3', { unreadCount: 1, mentionCount: 1, lastReadAt: '2025-01-01T00:00:00Z' }]
        ]),
        channelToServer: new Map([['ch-1', 's1'], ['ch-2', 's1'], ['ch-3', 's2']])
      })
    })

    it('returns unread and total mentions for "all" level', () => {
      const result = useReadStateStore.getState().getServerUnread('s1', () => 'all')
      expect(result).toEqual({ unread: true, mentions: 2 })
    })

    it('only counts mentions when channel level is "mentions"', () => {
      const result = useReadStateStore.getState().getServerUnread(
        's1',
        (chId) => (chId === 'ch-2' ? 'mentions' : 'all')
      )
      expect(result).toEqual({ unread: true, mentions: 2 })
    })

    it('skips channels with "none" level', () => {
      const result = useReadStateStore.getState().getServerUnread('s1', () => 'none')
      expect(result).toEqual({ unread: false, mentions: 0 })
    })

    it('falls back to server level when channel level is "all"', () => {
      const result = useReadStateStore.getState().getServerUnread(
        's1',
        () => 'all',
        () => 'mentions'
      )
      expect(result).toEqual({ unread: true, mentions: 2 })
    })

    it('channel level overrides server level', () => {
      const result = useReadStateStore.getState().getServerUnread(
        's1',
        () => 'none',
        () => 'all'
      )
      expect(result).toEqual({ unread: false, mentions: 0 })
    })

    it('ignores channels from other servers', () => {
      const result = useReadStateStore.getState().getServerUnread('s2', () => 'all')
      expect(result).toEqual({ unread: true, mentions: 1 })
    })
  })
})
