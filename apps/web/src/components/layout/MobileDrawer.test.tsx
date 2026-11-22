import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MobileDrawer } from './MobileDrawer'
import { __testing as backGestureTesting } from '@/hooks/useBackGestureClose'

jest.mock('@/hooks/useMobile', () => ({
  useIsMobile: () => true,
  useIsTablet: () => false
}))

jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => undefined
}))

function firePopState(): void {
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

beforeEach(() => {
  backGestureTesting.reset()
  window.history.replaceState(null, '', '/')
})

describe('MobileDrawer back-gesture integration', () => {
  it('invokes onClose when the browser back gesture fires while the drawer is open', () => {
    const onClose = jest.fn()

    render(
      <MobileDrawer open onClose={onClose} side="left">
        <div>content</div>
      </MobileDrawer>
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(backGestureTesting.getStackSize()).toBe(1)

    act(() => {
      firePopState()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(backGestureTesting.getStackSize()).toBe(0)
  })

  it('does not register a back-gesture entry when the drawer is closed', () => {
    const onClose = jest.fn()

    render(
      <MobileDrawer open={false} onClose={onClose} side="left">
        <div>content</div>
      </MobileDrawer>
    )

    expect(backGestureTesting.getStackSize()).toBe(0)
  })
})

it('keeps a vertical-first stroke with the list even when its release is mostly horizontal', () => {
  const close = jest.fn()
  render(<MobileDrawer open side="left" onClose={close}><div>Chats</div></MobileDrawer>)
  const target = screen.getByText('Chats')
  const point = (clientX: number, clientY: number) => ({ clientX, clientY })
  fireEvent.touchStart(target, { touches: [point(180, 150)] })
  fireEvent.touchMove(target, { touches: [point(180, 260)] })
  fireEvent.touchEnd(target, { changedTouches: [point(70, 165)] })
  expect(close).not.toHaveBeenCalled()
  fireEvent.touchStart(target, { touches: [point(180, 150)] })
  fireEvent.touchEnd(target, { changedTouches: [point(70, 165)] })
  expect(close).toHaveBeenCalledTimes(1)
})
