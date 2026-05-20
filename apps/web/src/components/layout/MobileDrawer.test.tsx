import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
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
