import { computeChannelBadge, computeServerBadge, computeServerBadges, computeTotalBadge, type NotifLevel } from './unread'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useServerStore } from '@/stores/server.store'

const state = (unreadCount: number, mentionCount: number) => ({
  unreadCount, mentionCount, lastReadAt: '', firstUnreadMessageId: null
})

beforeEach(() => {
  useReadStateStore.setState({
    channels: new Map([['ch1', state(5, 1)], ['ch2', state(3, 0)], ['ch3', state(4, 2)]]),
    dms: new Map([['dm1', state(3, 0)]]),
    channelToServer: new Map([['ch1', 's1'], ['ch2', 's1'], ['ch3', 's2']])
  })
  useNotifPrefStore.setState({ getEffective: () => 'all' })
})

it('has no indicator without a read state', () => {
  expect(computeChannelBadge(undefined, 'all').hasIndicator).toBe(false)
})

it.each<[NotifLevel, number, number, boolean, number]>([
  ['all', 5, 0, true, 0],
  ['all', 5, 2, true, 2],
  ['mentions', 5, 0, true, 0],
  ['mentions', 5, 2, true, 2],
  ['none', 5, 2, false, 0],
  ['all', 0, 0, false, 0]
])('%s: %i unread, %i mentions => highlight %s, count %i', (level, unread, mentions, highlighted, count) => {
  const badge = computeChannelBadge(state(unread, mentions), level)
  expect(badge.showUnread).toBe(highlighted)
  expect(badge.mentionCount).toBe(count)
  expect(badge.hasIndicator).toBe(highlighted || count > 0)
})

it('highlights a server with ordinary unread activity even on mentions-only delivery', () => {
  expect(computeServerBadge('s1', () => 'mentions')).toEqual({ unread: true, mentions: 1 })
  expect(computeServerBadge('s2', () => 'all')).toEqual({ unread: true, mentions: 2 })
})

it('ignores muted channels in server indicators', () => {
  expect(computeServerBadge('s1', () => 'none')).toEqual({ unread: false, mentions: 0 })
})

it('aggregates all servers with the same results as individual badges', () => {
  const { channels, channelToServer } = useReadStateStore.getState()
  const getEffective = jest.fn((channelId: string): NotifLevel => channelId === 'ch2' ? 'none' : 'mentions')
  const badges = computeServerBadges(channels, channelToServer, getEffective)

  expect(getEffective).toHaveBeenCalledTimes(3)
  expect(getEffective).toHaveBeenCalledWith('ch1', 's1')
  for (const serverId of ['s1', 's2']) {
    expect(badges.get(serverId)).toEqual(computeServerBadge(serverId, getEffective))
  }
})

it('omits empty, muted, and missing read states without losing mention-only indicators', () => {
  const channels = new Map([
    ['empty', state(0, 0)],
    ['muted', state(4, 2)],
    ['mention', state(0, 3)],
    ['unmapped', state(5, 5)]
  ])
  const mapping = new Map([
    ['empty', 's1'], ['muted', 's1'], ['missing', 's1'], ['mention', 's2']
  ])
  expect(computeServerBadges(channels, mapping, (id) => id === 'muted' ? 'none' : 'all'))
    .toEqual(new Map([['s2', { unread: true, mentions: 3 }]]))
})

it('resolves each channel only once across a large server rail', () => {
  const channels = new Map(Array.from({ length: 10000 }, (_, i) => [`ch${i}`, state(1, i % 3)]))
  const mapping = new Map(Array.from(channels.keys(), (id, i) => [id, `s${i % 100}`]))
  const iterate = jest.spyOn(mapping, Symbol.iterator)
  const getEffective = jest.fn((): NotifLevel => 'all')
  const badges = computeServerBadges(channels, mapping, getEffective)

  expect(badges.size).toBe(100)
  expect(iterate).toHaveBeenCalledTimes(1)
  expect(getEffective).toHaveBeenCalledTimes(channels.size)
  expect(Array.from(badges.values()).reduce((total, badge) => total + badge.mentions, 0)).toBe(9999)
})

it('counts only mentions and DMs for the OS/title badge', () => {
  expect(computeTotalBadge()).toBe(6)
})

it('does not hide unread counts merely because a conversation is selected', () => {
  useServerStore.setState({ viewMode: 'server' })
  useChannelStore.setState({ currentChannelId: 'ch1' })
  expect(computeTotalBadge()).toBe(6)
  useServerStore.setState({ viewMode: 'dm' })
  useDmStore.setState({ currentConversationId: 'dm1' })
  expect(computeTotalBadge()).toBe(6)
})

it('excludes muted channel mentions from the numbered badge', () => {
  useNotifPrefStore.setState({ getEffective: () => 'none' })
  expect(computeTotalBadge()).toBe(3)
})
