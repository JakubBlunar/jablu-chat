import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MobileViewport } from './MobileViewport'
import { MobileBottomNav } from './MobileBottomNav'

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: { user: null }) => unknown) => select({ user: null })
}))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('@/components/notifications/InAppNotificationBell', () => ({ InAppNotificationBell: () => null }))

const originalViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
let viewport: EventTarget & { height: number; offsetTop: number; scale: number }

beforeEach(() => {
  viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
  jest.replaceProperty(window, 'innerHeight', 844)
})
afterEach(() => {
  if (originalViewport) Object.defineProperty(window, 'visualViewport', originalViewport)
  else Reflect.deleteProperty(window, 'visualViewport')
  jest.restoreAllMocks()
})

function setup() {
  const view = render(
    <MobileViewport>
      <div data-message-composer>
        <textarea aria-label="Composer" />
      </div>
      <button>Message actions</button>
      <MobileBottomNav onOpenSettings={() => {}} />
    </MobileViewport>
  )
  return { ...view, shell: view.container.firstElementChild as HTMLElement, nav: screen.getByRole('navigation') }
}

function resize(height: number, offsetTop = 0, event = 'resize') {
  act(() => {
    Object.assign(viewport, { height, offsetTop })
    viewport.dispatchEvent(new Event(event))
  })
}

it('follows keyboard animation and viewport panning without a layout-viewport resize', () => {
  const { shell, nav } = setup()
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  act(() => screen.getByRole('textbox').focus())
  expect(nav).not.toBeVisible()
  for (const height of [720, 600, 500]) {
    resize(height)
    expect(window.innerHeight).toBe(844)
    expect(shell).toHaveStyle({ height: `${height}px` })
  }
  expect(shell.style.getPropertyValue('--keyboard-safe-area-bottom')).toBe('0px')
  resize(500, 80, 'scroll')
  expect(shell).toHaveStyle({ height: '500px', top: '80px' })
  resize(430, 110)
  expect(shell).toHaveStyle({ height: '430px', top: '110px' })
})

it('restores the shell and navigation after dismissal even if iOS retains focus and an old offset', () => {
  const { shell, nav } = setup()
  const input = screen.getByRole('textbox')
  act(() => input.focus())
  resize(500, 80)
  resize(844, 80)
  expect(input).toHaveFocus()
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  expect(shell.style.getPropertyValue('--keyboard-safe-area-bottom')).toBe('')
  expect(nav).toBeVisible()
  // A late scroll event must not hide the bar again just because focus stayed.
  resize(844, 80, 'scroll')
  expect(nav).toBeVisible()
  resize(500, 0)
  expect(nav).not.toBeVisible()
  expect(shell).toHaveStyle({ height: '500px', top: '0px' })
})

it('does not interpret pinch zoom as a keyboard or resize the shell around the zoomed view', () => {
  const { shell, nav } = setup()
  viewport.scale = 2
  resize(422, 120)
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  expect(nav).toBeVisible()
  viewport.scale = 1
  resize(844)
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
})

it('hides navigation when a retained-focus composer is tapped again after keyboard dismissal', () => {
  const { nav } = setup()
  const input = screen.getByRole('textbox')
  act(() => input.focus())
  resize(500)
  resize(844)
  expect(input).toHaveFocus()
  expect(nav).toBeVisible()
  // A tap on this already-focused textarea does not dispatch another focusin.
  fireEvent.click(input)
  expect(nav).not.toBeVisible()
  resize(844, 0, 'scroll')
  expect(nav).not.toBeVisible()
  resize(500)
  expect(nav).not.toBeVisible()
})

it('keeps keyboard geometry when iOS reports the visual height as innerHeight while scrolling', () => {
  jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  const { shell, nav } = setup()
  act(() => screen.getByRole('textbox').focus())
  resize(500, 80)
  jest.replaceProperty(window, 'innerHeight', 500)
  resize(500, 80, 'scroll')
  expect(nav).not.toBeVisible()
  expect(shell).toHaveStyle({ height: '500px', top: '80px' })
  expect(shell.style.getPropertyValue('--keyboard-safe-area-bottom')).toBe('0px')
})

it('hides navigation for a new reply even when the previous keyboard dismissal arrives at focus time', () => {
  const { nav } = setup()
  const input = screen.getByRole('textbox')
  act(() => input.focus())
  resize(500)
  act(() => screen.getByRole('button', { name: 'Message actions' }).focus())
  // Safari reports the final closed size at the same time as focus transfers
  // out of the message sheet, before a separate viewport resize event.
  viewport.height = 844
  act(() => input.focus())
  expect(nav).not.toBeVisible()
  resize(500)
  expect(nav).not.toBeVisible()
})

it('refreshes geometry on PWA restore and removes viewport listeners on unmount', () => {
  const remove = jest.spyOn(viewport, 'removeEventListener')
  const { shell, unmount } = setup()
  act(() => screen.getByRole('textbox').focus())
  viewport.height = 510
  fireEvent(window, new Event('pageshow'))
  expect(shell).toHaveStyle({ height: '510px' })
  viewport.height = 0
  act(() => viewport.dispatchEvent(new Event('resize')))
  expect(shell).toHaveStyle({ height: '510px' })
  unmount()
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  expect(shell.style.height).toBe('')
})

it('keeps the focused composer working in landscape without clearing the draft or selection', () => {
  jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(390)
  jest.replaceProperty(window, 'innerHeight', 390)
  const { shell, nav } = setup()
  const input = screen.getByRole('textbox') as HTMLTextAreaElement
  input.value = 'Unsent draft'
  input.setSelectionRange(3, 3)
  act(() => input.focus())
  resize(210, 40)
  fireEvent(window, new Event('orientationchange'))
  expect(input).toHaveFocus()
  expect(input.value).toBe('Unsent draft')
  expect(input.selectionStart).toBe(3)
  expect(shell).toHaveStyle({ height: '210px', top: '40px' })
  expect(nav).not.toBeVisible()
})

it('does not exceed the new layout height while an orientation change still reports old viewport geometry', () => {
  jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(390)
  const { shell } = setup()
  act(() => screen.getByRole('textbox').focus())
  resize(500)
  fireEvent(window, new Event('orientationchange'))
  expect(shell).toHaveStyle({ height: '390px', top: '0px' })
  resize(210)
  expect(shell).toHaveStyle({ height: '210px', top: '0px' })
})

it('recovers portrait height on resume even if iOS keeps reporting its landscape viewport', () => {
  let layoutHeight = 390
  jest.spyOn(document.documentElement, 'clientHeight', 'get').mockImplementation(() => layoutHeight)
  jest.replaceProperty(window, 'innerHeight', 390)
  viewport.height = 210
  const { shell, nav } = setup()
  const input = screen.getByRole('textbox')
  act(() => input.focus())
  resize(210, 40)
  const visibility = jest.spyOn(document, 'visibilityState', 'get')
  visibility.mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(input).not.toHaveFocus()
  layoutHeight = 844
  viewport.height = 390
  visibility.mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  expect(nav).toBeVisible()
})

it('does not reuse a stale landscape height when the mobile shell remounts in portrait', () => {
  jest.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844)
  viewport.height = 390
  viewport.offsetTop = 40
  const { shell, nav } = setup()
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  expect(nav).toBeVisible()
  // A new keyboard session still follows the real viewport after recovery.
  act(() => screen.getByRole('textbox').focus())
  resize(500, 80)
  expect(shell).toHaveStyle({ height: '500px', top: '80px' })
  expect(nav).not.toBeVisible()
})

it('resets retained editor focus on a back-forward cache restore', () => {
  const { shell, nav } = setup()
  const input = screen.getByRole('textbox')
  act(() => input.focus())
  resize(500, 80)
  fireEvent(window, new PageTransitionEvent('pageshow', { persisted: true }))
  expect(input).not.toHaveFocus()
  expect(shell).toHaveStyle({ height: '844px', top: '0px' })
  expect(nav).toBeVisible()
})

it('keeps the CSS viewport fallback when the Visual Viewport API is unavailable', () => {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  const { shell } = setup()
  expect(shell.style.height).toBe('')
  expect(shell).toHaveClass('h-[100dvh]')
})
