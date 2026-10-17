import { act, renderHook } from '@testing-library/react'
import { useMessageActionController } from './useMessageActionController'
import { useTranslationStore } from '@/stores/translation.store'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { setMessagePinned } from '@/lib/messagePins'
import { toggleMessageReactionAndRemember } from '@/lib/reactions'
import { showToast } from '@/stores/toast.store'
import { makeMessage } from '@/test/factories'

jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/lib/messagePins', () => ({ setMessagePinned: jest.fn() }))
jest.mock('@/lib/reactions', () => ({ toggleMessageReactionAndRemember: jest.fn() }))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => true }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'me' } })) }
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useTranslationStore.setState(
    {
      ...useTranslationStore.getInitialState(),
      fetchCapabilities: jest.fn().mockResolvedValue(undefined),
      loadPreference: jest.fn().mockResolvedValue(undefined)
    },
    true
  )
})
afterEach(() => jest.restoreAllMocks())

it.each(['pin', 'bookmark'] as const)(
  'only completes %s after success and reports errors without closing',
  async (action) => {
    const operation = jest.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    jest.mocked(setMessagePinned).mockImplementation(operation)
    useBookmarkStore.setState({ toggleBookmark: operation })
    const onComplete = jest.fn()
    const { result } = renderHook(() =>
      useMessageActionController({
        message: makeMessage(),
        mode: 'dm',
        contextId: 'dm',
        onComplete
      })
    )
    await act(() => result.current[action]())
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
    await act(() => result.current[action]())
    expect(onComplete).toHaveBeenCalledTimes(1)
  }
)

it("shares policy while never using server permissions to delete another user's DM", () => {
  const { result, rerender } = renderHook(
    ({ mode }: { mode: 'dm' | 'channel' }) =>
      useMessageActionController({
        message: makeMessage({ authorId: 'someone-else' }),
        mode,
        contextId: 'context',
        onEdit: jest.fn()
      }),
    { initialProps: { mode: 'dm' } }
  )
  expect(result.current.canDelete).toBe(false)
  expect(result.current.canEdit).toBe(false)
  expect(result.current.canPin).toBe(true)
  rerender({ mode: 'channel' })
  expect(result.current.canDelete).toBe(true)
  expect(result.current.canPin).toBe(true)
})

it('retains failed reactions and completes only after a confirmed retry', async () => {
  jest.mocked(toggleMessageReactionAndRemember).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const onComplete = jest.fn()
  const message = makeMessage()
  const { result } = renderHook(() => useMessageActionController({ message, mode: 'dm', contextId: 'dm', onComplete }))
  await act(() => result.current.react('ok'))
  expect(onComplete).not.toHaveBeenCalled()
  await act(() => result.current.react('ok'))
  expect(onComplete).toHaveBeenCalledTimes(1)
  expect(toggleMessageReactionAndRemember).toHaveBeenLastCalledWith({
    messageId: message.id,
    mode: 'dm',
    emoji: 'ok',
    isCustom: false
  })
})

it.each(['pin', 'translate'] as const)(
  'does not close a newly opened action surface after an old %s finishes',
  async (action) => {
    let finish!: () => void
    const operation = new Promise<void>((resolve) => {
      finish = resolve
    })
    jest.mocked(setMessagePinned).mockReturnValue(operation)
    useTranslationStore.setState({ targetLang: 'cs', translate: jest.fn(() => operation.then(() => null)) })
    const onComplete = jest.fn()
    const { result, unmount } = renderHook(() =>
      useMessageActionController({
        message: makeMessage(),
        mode: 'dm',
        contextId: 'dm',
        onComplete
      })
    )
    act(() => {
      if (action === 'pin') void result.current.pin()
      else result.current.translate(jest.fn())
    })
    unmount()
    await act(async () => {
      finish()
      await operation
    })
    expect(onComplete).not.toHaveBeenCalled()
  }
)
