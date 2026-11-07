import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { useMemberStore } from '@/stores/member.store'
import { useChannelStore } from '@/stores/channel.store'
import { useOutboxStore } from '@/stores/outbox.store'
import { useAuthStore } from '@/stores/auth.store'
import { useDraftStore, composerKey } from '@/stores/draft.store'
import { useMessageComposer } from './useMessageComposer'

jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ has: () => false }) }))
jest.mock('@/components/chat/useBotCommands', () => ({ useBotCommands: () => [] }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

it('refreshes server nicknames reactively and queues canonical mentions while keeping the draft readable', async () => {
  useAuthStore.setState({ user: { id: 'mention-owner' } } as never)
  useChannelStore.setState({ channels: [{ id: 'mention-channel', serverId: 'server' }] } as never)
  useMemberStore.setState({
    members: [
      {
        userId: 'friend',
        serverId: 'server',
        displayName: 'Reno',
        user: { id: 'friend', username: 'jt', displayName: 'Global name', avatarUrl: null }
      }
    ]
  } as never)
  const enqueue = jest.spyOn(useOutboxStore.getState(), 'enqueue').mockResolvedValue(undefined as never)
  const { result, unmount } = renderHook(() =>
    useMessageComposer({
      mode: 'channel',
      contextId: 'mention-channel',
      placeholder: 'Message',
      replyTarget: null,
      onCancelReply: jest.fn()
    })
  )
  expect(result.current.mentionMembers[0].displayName).toBe('Reno')
  act(() =>
    useMemberStore.setState((state) => ({
      members: state.members.map((member) => ({ ...member, displayName: 'Reno Again' }))
    }))
  )
  expect(result.current.mentionMembers[0].displayName).toBe('Reno Again')
  act(() => result.current.setValue('@"Reno Again" hello'))
  expect(result.current.value).toBe('@"Reno Again" hello')
  await act(async () => result.current.send())
  expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ content: '@jt hello' }))
  unmount()
  enqueue.mockRestore()
})

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
