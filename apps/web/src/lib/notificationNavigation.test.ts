import { messageNotificationUrl, notificationTag } from '@chat/shared'
import { navigateFromNotification, setNotificationNavigator } from './notificationNavigation'

beforeEach(() => {
  setNotificationNavigator(jest.fn())
  setNotificationNavigator(null)
})

afterEach(() => {
  setNotificationNavigator(null)
  jest.restoreAllMocks()
})

it('queues cold-start clicks until the actual router is mounted', () => {
  const navigate = jest.fn()
  navigateFromNotification('/channels/s1/ch1?m=m1')
  setNotificationNavigator(navigate)
  expect(navigate).toHaveBeenCalledWith('/channels/s1/ch1?m=m1')
})

it.each([
  '/channels/s1/ch1?m=m1',
  '/#/channels/s1/ch1?m=m1',
  '#/channels/s1/ch1?m=m1'
])('normalizes a notification target: %s', (url) => {
  const navigate = jest.fn()
  setNotificationNavigator(navigate)
  navigateFromNotification(url)
  expect(navigate).toHaveBeenCalledWith('/channels/s1/ch1?m=m1')
})

it('routes a same-channel click every time rather than treating it as a no-op', () => {
  const navigate = jest.fn()
  setNotificationNavigator(navigate)
  navigateFromNotification('/channels/s1/ch1?m=m1')
  navigateFromNotification('/channels/s1/ch1?m=m1')
  expect(navigate).toHaveBeenCalledTimes(2)
})

it('rejects cross-origin and protocol-relative targets with a diagnostic', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
  const navigate = jest.fn()
  setNotificationNavigator(navigate)
  navigateFromNotification('https://other.test/channels/s1/ch1')
  navigateFromNotification('//other.test/channels/s1/ch1')
  expect(navigate).not.toHaveBeenCalled()
  expect(warn).toHaveBeenCalledTimes(2)
})

it('keeps precise message/thread targets but shares the conversation toast tag', () => {
  const path = '/channels/s1/ch1'
  const url = messageNotificationUrl(path, 'reply', 'parent')
  expect(url).toBe('/channels/s1/ch1?m=reply&thread=parent')
  expect(notificationTag(url)).toBe(notificationTag(path))
  expect(notificationTag('/channels/@me/dm?call=call1')).toBe('jablu-/channels/@me/dm?call=call1')
})
