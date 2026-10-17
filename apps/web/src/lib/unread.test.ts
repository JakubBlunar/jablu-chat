import { computeChannelBadge, computeServerBadge, computeTotalBadge, type NotifLevel } from './unread'
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
