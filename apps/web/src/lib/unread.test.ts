import { computeChannelBadge, computeServerBadge, computeTotalBadge } from './unread'
import type { NotifLevel } from './unread'

describe('computeChannelBadge', () => {
  it('returns empty badge when isActive is true', () => {
    const rs = { unreadCount: 5, mentionCount: 2 }
    const badge = computeChannelBadge(rs, 'all', true)

    expect(badge).toEqual({ showUnread: false, showMentions: false, mentionCount: 0, hasIndicator: false })
  })

  it('returns empty badge when read state is undefined', () => {
    const badge = computeChannelBadge(undefined, 'all', false)

    expect(badge).toEqual({ showUnread: false, showMentions: false, mentionCount: 0, hasIndicator: false })
  })

  it('shows unread and mentions when level is "all"', () => {
    const rs = { unreadCount: 3, mentionCount: 1 }
    const badge = computeChannelBadge(rs, 'all', false)

    expect(badge.showUnread).toBe(true)
    expect(badge.showMentions).toBe(true)
    expect(badge.mentionCount).toBe(1)
    expect(badge.hasIndicator).toBe(true)
  })

  it('shows only unread (no mentions) when level is "all" and mentionCount is 0', () => {
    const rs = { unreadCount: 5, mentionCount: 0 }
    const badge = computeChannelBadge(rs, 'all', false)

    expect(badge.showUnread).toBe(true)
    expect(badge.showMentions).toBe(false)
    expect(badge.mentionCount).toBe(0)
    expect(badge.hasIndicator).toBe(true)
  })

  it('shows only mentions when level is "mentions"', () => {
    const rs = { unreadCount: 10, mentionCount: 2 }
    const badge = computeChannelBadge(rs, 'mentions', false)

    expect(badge.showUnread).toBe(false)
    expect(badge.showMentions).toBe(true)
    expect(badge.mentionCount).toBe(2)
    expect(badge.hasIndicator).toBe(true)
  })

  it('no indicator when level is "mentions" and mentionCount is 0', () => {
    const rs = { unreadCount: 10, mentionCount: 0 }
    const badge = computeChannelBadge(rs, 'mentions', false)

    expect(badge.showUnread).toBe(false)
    expect(badge.showMentions).toBe(false)
    expect(badge.hasIndicator).toBe(false)
  })

  it('returns empty badge when level is "none"', () => {
    const rs = { unreadCount: 10, mentionCount: 5 }
    const badge = computeChannelBadge(rs, 'none', false)

    expect(badge.showUnread).toBe(false)
    expect(badge.showMentions).toBe(false)
    expect(badge.mentionCount).toBe(0)
    expect(badge.hasIndicator).toBe(false)
  })

  it('returns no indicator when unread and mention counts are both 0', () => {
    const rs = { unreadCount: 0, mentionCount: 0 }
    const badge = computeChannelBadge(rs, 'all', false)

    expect(badge.hasIndicator).toBe(false)
  })

  it.each<[NotifLevel, number, number, boolean, boolean]>([
    ['all', 1, 0, true, false],
    ['all', 0, 1, false, true],
    ['mentions', 5, 0, false, false],
    ['mentions', 5, 3, false, true],
    ['none', 5, 3, false, false],
  ])('level=%s unread=%i mentions=%i => showUnread=%s showMentions=%s', (level, unread, mentions, expectedUnread, expectedMentions) => {
    const badge = computeChannelBadge({ unreadCount: unread, mentionCount: mentions }, level, false)
    expect(badge.showUnread).toBe(expectedUnread)
    expect(badge.showMentions).toBe(expectedMentions)
  })
})

describe('computeServerBadge', () => {
  beforeEach(() => {
    const { useReadStateStore } = require('@/stores/readState.store')
    useReadStateStore.setState({
      channels: new Map([
        ['ch1', { unreadCount: 3, mentionCount: 1 }],
        ['ch2', { unreadCount: 2, mentionCount: 0 }],
        ['ch3', { unreadCount: 1, mentionCount: 0 }],
      ]),
      channelToServer: new Map([
        ['ch1', 's1'],
        ['ch2', 's1'],
        ['ch3', 's2'],
      ])
    })
  })

  it('aggregates badges for channels belonging to a server', () => {
    const result = computeServerBadge('s1', () => 'all')

    expect(result.unread).toBe(true)
    expect(result.mentions).toBe(1)
  })

  it('ignores channels from other servers', () => {
    const result = computeServerBadge('s2', () => 'all')

    expect(result.unread).toBe(true)
    expect(result.mentions).toBe(0)
  })

  it('respects notification levels', () => {
    const result = computeServerBadge('s1', () => 'none')

    expect(result.unread).toBe(false)
    expect(result.mentions).toBe(0)
  })
})

describe('computeTotalBadge', () => {
  beforeEach(() => {
    const { useReadStateStore } = require('@/stores/readState.store')
    const { useNotifPrefStore } = require('@/stores/notifPref.store')
    const { useServerStore } = require('@/stores/server.store')
    const { useChannelStore } = require('@/stores/channel.store')
    const { useDmStore } = require('@/stores/dm.store')

    useReadStateStore.setState({
      channels: new Map([
        ['ch1', { unreadCount: 5, mentionCount: 1 }],
      ]),
      dms: new Map([
        ['dm1', { unreadCount: 3, mentionCount: 0 }],
      ]),
      channelToServer: new Map([['ch1', 's1']])
    })
    useNotifPrefStore.setState({ getEffective: () => 'all' })
    useServerStore.setState({ viewMode: 'server' })
    useChannelStore.setState({ currentChannelId: null })
    useDmStore.setState({ currentConversationId: null })
  })

  it('sums channel unreads and DM unreads', () => {
    expect(computeTotalBadge()).toBe(8) // 5 + 3
  })

  it('excludes active channel', () => {
    const { useChannelStore } = require('@/stores/channel.store')
    useChannelStore.setState({ currentChannelId: 'ch1' })

    expect(computeTotalBadge()).toBe(3)
  })

  it('excludes active DM conversation in dm viewMode', () => {
    const { useServerStore } = require('@/stores/server.store')
    const { useDmStore } = require('@/stores/dm.store')
    useServerStore.setState({ viewMode: 'dm' })
    useDmStore.setState({ currentConversationId: 'dm1' })

    expect(computeTotalBadge()).toBe(5)
  })

  it('uses mention count instead of unread count for mentions-only level', () => {
    const { useNotifPrefStore } = require('@/stores/notifPref.store')
    useNotifPrefStore.setState({ getEffective: () => 'mentions' })

    expect(computeTotalBadge()).toBe(4) // mention 1 + dm 3
  })
})
