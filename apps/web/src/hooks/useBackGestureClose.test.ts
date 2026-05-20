import { act, renderHook } from '@testing-library/react'
import { __testing, useBackGestureClose } from './useBackGestureClose'

function firePopState(): void {
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

beforeEach(() => {
  __testing.reset()
  window.history.replaceState(null, '', '/')
})

describe('useBackGestureClose', () => {
  it('does nothing when not enabled', () => {
    const onClose = jest.fn()
    const pushSpy = jest.spyOn(window.history, 'pushState')

    renderHook(() => useBackGestureClose(true, onClose, false))

    expect(pushSpy).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(0)

    pushSpy.mockRestore()
  })

  it('does nothing when not open', () => {
    const onClose = jest.fn()
    const pushSpy = jest.spyOn(window.history, 'pushState')

    renderHook(() => useBackGestureClose(false, onClose, true))

    expect(pushSpy).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(0)

    pushSpy.mockRestore()
  })

  it('pushes a synthetic history entry and registers when opened', () => {
    const onClose = jest.fn()
    const pushSpy = jest.spyOn(window.history, 'pushState')

    renderHook(() => useBackGestureClose(true, onClose, true))

    expect(pushSpy).toHaveBeenCalledTimes(1)
    const [state] = pushSpy.mock.calls[0]
    expect((state as any).jablu_overlay_id).toEqual(expect.any(Number))
    expect(__testing.getStackSize()).toBe(1)

    pushSpy.mockRestore()
  })

  it('invokes onClose and pops the stack when popstate fires (back gesture)', () => {
    const onClose = jest.fn()
    renderHook(() => useBackGestureClose(true, onClose, true))
    expect(__testing.getStackSize()).toBe(1)

    act(() => {
      firePopState()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(__testing.getStackSize()).toBe(0)
    expect(__testing.isSuppressingBack()).toBe(false)
  })

  it('does not call history.back again during cleanup after popstate already popped the entry', () => {
    let open = true
    const onClose = jest.fn(() => {
      open = false
    })
    const backSpy = jest.spyOn(window.history, 'back')

    const { rerender } = renderHook(() => useBackGestureClose(open, onClose, true))

    act(() => {
      firePopState()
    })

    rerender()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(backSpy).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(0)

    backSpy.mockRestore()
  })

  it('calls history.back (with suppression) when closed programmatically and entry is still on top', () => {
    let open = true
    const onClose = jest.fn()
    const backSpy = jest.spyOn(window.history, 'back').mockImplementation(() => {
      firePopState()
    })

    const { rerender } = renderHook(() => useBackGestureClose(open, onClose, true))
    expect(__testing.getStackSize()).toBe(1)

    act(() => {
      open = false
      rerender()
    })

    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(__testing.isSuppressingBack()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(0)

    backSpy.mockRestore()
  })

  it('skips history.back when a foreign navigation has buried the entry', () => {
    let open = true
    const onClose = jest.fn()
    const backSpy = jest.spyOn(window.history, 'back')

    const { rerender } = renderHook(() => useBackGestureClose(open, onClose, true))

    act(() => {
      window.history.pushState({ key: 'router-entry' }, '', '/some/route')
    })

    act(() => {
      open = false
      rerender()
    })

    expect(backSpy).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(0)

    backSpy.mockRestore()
  })

  it('closes nested overlays LIFO on successive back gestures', () => {
    const closeA = jest.fn()
    const closeB = jest.fn()

    renderHook(() => useBackGestureClose(true, closeA, true))
    renderHook(() => useBackGestureClose(true, closeB, true))

    expect(__testing.getStackSize()).toBe(2)

    act(() => {
      firePopState()
    })

    expect(closeB).toHaveBeenCalledTimes(1)
    expect(closeA).not.toHaveBeenCalled()
    expect(__testing.getStackSize()).toBe(1)

    act(() => {
      firePopState()
    })

    expect(closeA).toHaveBeenCalledTimes(1)
    expect(__testing.getStackSize()).toBe(0)
  })

  it('uses the latest onClose reference without re-running the effect', () => {
    let onClose = jest.fn()
    const firstOnClose = onClose
    const pushSpy = jest.spyOn(window.history, 'pushState')

    const { rerender } = renderHook(({ cb }) => useBackGestureClose(true, cb, true), {
      initialProps: { cb: onClose }
    })

    expect(pushSpy).toHaveBeenCalledTimes(1)

    const secondOnClose = jest.fn()
    onClose = secondOnClose
    rerender({ cb: onClose })

    expect(pushSpy).toHaveBeenCalledTimes(1)

    act(() => {
      firePopState()
    })

    expect(firstOnClose).not.toHaveBeenCalled()
    expect(secondOnClose).toHaveBeenCalledTimes(1)

    pushSpy.mockRestore()
  })
})
