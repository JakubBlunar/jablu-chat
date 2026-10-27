import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { useAuthStore } from '@/stores/auth.store'
import { useDraftStore, composerKey } from '@/stores/draft.store'
import { useMessageComposer } from './useMessageComposer'

jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ has: () => false }) }))
jest.mock('@/components/chat/useBotCommands', () => ({ useBotCommands: () => [] }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))

it('keeps independent drafts when switching composer identity', () => {
  useAuthStore.setState({ user: { id: 'draft-owner' } } as never)
  const { result, rerender, unmount } = renderHook(
    ({ id }) =>
      useMessageComposer({
        mode: 'channel',
        contextId: id,
        placeholder: 'Message',
        replyTarget: null,
        onCancelReply: jest.fn()
      }),
    { initialProps: { id: 'one' } }
  )
  act(() => result.current.setValue('First draft'))
  rerender({ id: 'two' })
  expect(result.current.value).toBe('')
  act(() => result.current.setValue('Second draft'))
  expect(useDraftStore.getState().drafts[composerKey('draft-owner', 'channel', 'one')]?.text).toBe('First draft')
  rerender({ id: 'one' })
  expect(result.current.value).toBe('First draft')
  unmount()
})
