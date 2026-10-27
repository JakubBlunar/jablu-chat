import { act, renderHook } from '@testing-library/react'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { makeChannel } from '@/test/factories'
import { useCreateChannel } from './useCreateChannel'
import { useEditChannel } from './useEditChannel'

const goToChannel = jest.fn()
jest.mock('@/hooks/useAppNavigate', () => ({
  useAppNavigate: () => ({ goToChannel, goToServer: jest.fn() })
}))

beforeEach(() => {
  jest.restoreAllMocks()
  goToChannel.mockClear()
  useServerStore.setState({ currentServerId: 'server' })
  useChannelStore.setState({ fetchChannels: jest.fn().mockResolvedValue(undefined) })
})

it('creates through the normalized draft and closes only after refresh', async () => {
  const post = jest.spyOn(api, 'post').mockResolvedValue({ id: 'created' })
  const close = jest.fn()
  const { result } = renderHook(() => useCreateChannel({ open: true, onClose: close, defaultCategoryId: 'category' }))
  act(() => {
    result.current.form.setRawName('  New Channel ')
    result.current.form.setDescription(' Description ')
  })
  await act(async () => {
    await result.current.handleCreate()
  })
  expect(post).toHaveBeenCalledWith('/api/servers/server/channels', {
    name: 'new-channel',
    type: 'text',
    categoryId: 'category',
    description: 'Description'
  })
  expect(goToChannel).toHaveBeenCalledWith('server', 'created')
  expect(close).toHaveBeenCalledTimes(1)
})

it('retains the create draft after a failed request and resets it on cancel', async () => {
  jest.spyOn(api, 'post').mockRejectedValue(new Error('Unavailable'))
  const close = jest.fn()
  const { result } = renderHook(() => useCreateChannel({ open: true, onClose: close }))
  act(() => result.current.form.setRawName('Draft'))
  await act(async () => {
    await result.current.handleCreate()
  })
  expect(result.current.form.rawName).toBe('Draft')
  expect(result.current.error).toBe('Unavailable')
  expect(close).not.toHaveBeenCalled()
  act(() => result.current.handleCancel())
  expect(result.current.form.rawName).toBe('')
  expect(result.current.error).toBeNull()
})

it('sends only edited channel fields and preserves values after a failed save', async () => {
  const update = jest.spyOn(api, 'updateChannel').mockRejectedValue(new Error('Unavailable'))
  const close = jest.fn()
  const { result } = renderHook(() => useEditChannel({ channel: makeChannel('channel', 'server'), onClose: close }))
  act(() => result.current.form.setDescription(' Updated '))
  await act(async () => {
    await result.current.handleSave()
  })
  expect(update).toHaveBeenCalledWith('server', 'channel', { description: 'Updated' })
  expect(result.current.form.description).toBe(' Updated ')
  expect(close).not.toHaveBeenCalled()
})
