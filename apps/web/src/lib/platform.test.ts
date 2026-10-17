import { getDevicePlatform } from './platform'

it.each([
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0, 'windows'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 0, 'macos'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 5, 'ios'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 5, 'ios'],
  ['Mozilla/5.0 (Linux; Android 16)', 5, 'android'],
  ['Mozilla/5.0 (X11; Linux x86_64)', 0, 'linux']
])('detects %s without confusing iPad desktop mode', (userAgent, maxTouchPoints, platform) => {
  expect(getDevicePlatform({ userAgent, maxTouchPoints })).toBe(platform)
})

it('uses available user agent platform hints', () => {
  expect(getDevicePlatform({ userAgent: 'Browser', maxTouchPoints: 0, userAgentData: { platform: 'Windows' } })).toBe(
    'windows'
  )
})
