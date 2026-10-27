import { act, renderHook } from '@testing-library/react'
import { makeChannel } from '@/test/factories'
import { useServerDialogState } from './useServerDialogState'

it('keeps an active dialog and payload across rerenders, then clears it when changing server', () => {
  const { result, rerender } = renderHook(({ server }) => useServerDialogState(server), {
    initialProps: { server: 'one' }
  })
  act(() => {
    result.current.setEditingChannel(makeChannel('channel', 'one'))
    result.current.setEventsInitialId('event')
    result.current.setEventsOpen(true)
  })
  rerender({ server: 'one' })
  expect(result.current.editingChannel?.id).toBe('channel')
  expect(result.current.eventsInitialId).toBe('event')
  rerender({ server: 'two' })
  expect(result.current.ownerServerId).toBe('two')
  expect(result.current.editingChannel).toBeNull()
  expect(result.current.eventsOpen).toBe(false)
  expect(result.current.eventsInitialId).toBeNull()
})
