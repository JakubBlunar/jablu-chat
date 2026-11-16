import i18n from 'i18next'
import nav from '@/i18n/locales/en/nav.json'
import { onReactionNotification, type ReactionNotification } from './reactionNotifications'
import { showNotification } from '@/lib/notifications'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useDmStore } from '@/stores/dm.store'

jest.mock('@/lib/notifications', () => ({ showNotification: jest.fn() }))

const payload: ReactionNotification = {
  authorName: 'Friend', emoji: '🎉', isCustom: false, snippet: 'Hello',
  serverId: 'server', channelId: 'channel', url: '/channels/server/channel?m=message'
}

beforeEach(() => {
  jest.clearAllMocks()
  i18n.addResourceBundle('en', 'nav', nav)
  useNotifPrefStore.setState({ prefs: {}, serverPrefs: {} })
  useDmStore.setState({ conversations: [] })
})

it('shows a personal alert with its message target without needing a cached message', () => {
  onReactionNotification(payload)
  expect(showNotification).toHaveBeenCalledWith('Friend reacted 🎉 to your message', 'Hello', payload.url)
})

it('formats custom reactions and handles missing previews', () => {
  onReactionNotification({ ...payload, emoji: 'party', isCustom: true, snippet: undefined })
  expect(showNotification).toHaveBeenCalledWith('Friend reacted :party: to your message', '', payload.url)
})

it('honors local channel and server mutes, and allows personal alerts in mentions-only channels', () => {
  useNotifPrefStore.setState({ serverPrefs: { server: 'none' } })
  onReactionNotification(payload)
  expect(showNotification).not.toHaveBeenCalled()
  useNotifPrefStore.setState({ prefs: { channel: 'mentions' } })
  onReactionNotification(payload)
  expect(showNotification).toHaveBeenCalledTimes(1)
})

it('honors DM mutes', () => {
  useDmStore.setState({ conversations: [{ id: 'dm', muted: true }] as any })
  onReactionNotification({ ...payload, channelId: undefined, conversationId: 'dm' })
  expect(showNotification).not.toHaveBeenCalled()
})
