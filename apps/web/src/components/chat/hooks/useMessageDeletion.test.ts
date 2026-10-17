import { act, renderHook, waitFor } from '@testing-library/react'
import { useMessageDeletion } from './useMessageDeletion'
import { deleteMessage } from '@/lib/messageActions'
import { makeMessage } from '@/test/factories'

jest.mock('@/lib/messageActions', () => ({ deleteMessage: jest.fn() }))
jest.mock('@/lib/messageActionError', () => ({ messageActionError: () => 'delete failed' }))
beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

it('keeps failed deletion recoverable and closes only after confirmation', async () => {
  const onDeleted = jest.fn()
  jest.mocked(deleteMessage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  const { result } = renderHook(() => useMessageDeletion('channel', 'channel', makeMessage(), onDeleted))
  await act(() => result.current.confirm())
  expect(result.current.error).toBe('delete failed')
  expect(onDeleted).not.toHaveBeenCalled()
  await act(() => result.current.confirm())
  expect(onDeleted).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBeNull()
})

it('prevents double confirmation while the server is responding', async () => {
  let finish!: () => void
  jest.mocked(deleteMessage).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const { result } = renderHook(() => useMessageDeletion('dm', 'dm', makeMessage(), jest.fn()))
  let operation!: Promise<void>
  act(() => {
    operation = result.current.confirm()
  })
  expect(result.current.pending).toBe(true)
  await act(() => result.current.confirm())
  expect(deleteMessage).toHaveBeenCalledTimes(1)
  await act(async () => {
    finish()
    await operation
  })
  await waitFor(() => expect(result.current.pending).toBe(false))
})
