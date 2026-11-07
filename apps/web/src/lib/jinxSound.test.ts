import type { Message } from '@chat/shared'
import { playJinxForNewMessage } from './jinxSound'
import { playJinxSound } from './sounds'
import { isAppFocused } from './appVisibility'
import { useSettingsStore } from '@/stores/settings.store'
jest.mock('./sounds', () => ({ playJinxSound: jest.fn() }))
jest.mock('./appVisibility', () => ({ isAppFocused: jest.fn(() => true) }))
let mockUserId = 'a'
jest.mock('@/stores/auth.store', () => ({ useAuthStore: { getState: () => ({ user: { id: mockUserId } }) } }))
const message = (id: string): Message =>
  ({
    id,
    authorId: id,
    author: { id, username: id },
    content: 'same',
    channelId: 'channel',
    createdAt: '2026-11-07T12:34:10Z'
  }) as Message
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-07T12:34:11Z'))
  jest.clearAllMocks()
  jest.mocked(isAppFocused).mockReturnValue(true)
  useSettingsStore.setState({ notifSoundEnabled: true })
  mockUserId = 'a'
})
afterEach(() => jest.useRealTimers())
it('celebrates fresh group membership changes without repeating socket duplicates', () => {
  const a = message('a'),
    b = message('b'),
    c = message('c')
  playJinxForNewMessage([a], [a, b], b)
  expect(playJinxSound).toHaveBeenCalledTimes(1)
  playJinxForNewMessage([a, b], [a, b], b)
  playJinxForNewMessage([a, b], [a, b, c], c)
  expect(playJinxSound).toHaveBeenCalledTimes(2)
})
it('keeps spectators silent, including when more people join', () => {
  mockUserId = 'spectator'
  const a = message('a'),
    b = message('b'),
    c = message('c')
  playJinxForNewMessage([a], [a, b], b)
  playJinxForNewMessage([a, b], [a, b, c], c)
  expect(playJinxSound).not.toHaveBeenCalled()
})
it('celebrates for a third person whose own message joins an existing group', () => {
  mockUserId = 'c'
  const a = message('a'),
    b = message('b'),
    c = message('c')
  playJinxForNewMessage([a, b], [a, b, c], c)
  expect(playJinxSound).toHaveBeenCalledTimes(1)
})
it('keeps history, offscreen events, muted sound and rejected/old arrivals silent', () => {
  const a = message('a'),
    b = message('b')
  playJinxForNewMessage([a], [a], b)
  jest.mocked(isAppFocused).mockReturnValue(false)
  playJinxForNewMessage([a], [a, b], b)
  jest.mocked(isAppFocused).mockReturnValue(true)
  useSettingsStore.setState({ notifSoundEnabled: false })
  playJinxForNewMessage([a], [a, b], b)
  useSettingsStore.setState({ notifSoundEnabled: true })
  jest.setSystemTime(new Date('2026-11-07T12:35:11Z'))
  playJinxForNewMessage([a], [a, b], b)
  expect(playJinxSound).not.toHaveBeenCalled()
})
