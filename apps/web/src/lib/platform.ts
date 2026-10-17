export type DevicePlatform = 'windows' | 'macos' | 'ios' | 'android' | 'linux' | 'other'

export function getDevicePlatform(
  device: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { userAgentData?: { platform: string } } = navigator
): DevicePlatform {
  const ua = device.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh|MacIntel/i.test(ua) && device.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  const platform = device.userAgentData?.platform ?? ua
  if (/Win/i.test(platform)) return 'windows'
  if (/Mac/i.test(platform)) return 'macos'
  if (/Linux/i.test(platform)) return 'linux'
  return 'other'
}
