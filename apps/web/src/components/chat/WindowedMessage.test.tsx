import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { revealMessageElement, WindowedMessage } from './WindowedMessage'

let intersect: IntersectionObserverCallback
beforeEach(() => {
  global.IntersectionObserver = jest.fn((callback) => {
    intersect = callback
    return { observe: jest.fn(), disconnect: jest.fn() }
  }) as unknown as typeof IntersectionObserver
})

function mount(initialMounted = false) {
  const root = createRef<HTMLDivElement>()
  return render(<div ref={root}><WindowedMessage id="msg-target" root={root} initialMounted={initialMounted} estimate={80} label="Show target" decoration={<span>Unread marker</span>}>
    <div tabIndex={-1}><button>Edit target</button></div>
  </WindowedMessage></div>)
}
function visibility(isIntersecting: boolean) {
  act(() => intersect([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver))
}

it('keeps a stable scroll target and divider while parking expensive children', () => {
  mount()
  const target = document.getElementById('msg-target')
  expect(screen.queryByText('Edit target')).toBeNull()
  expect(screen.getByText('Unread marker')).toBeTruthy()
  act(() => { expect(revealMessageElement('msg-target')).toBe(target) })
  expect(screen.getByText('Edit target')).toBeTruthy()
  visibility(false)
  expect(screen.queryByText('Edit target')).toBeNull()
  expect(document.getElementById('msg-target')).toBe(target)
  visibility(true)
  expect(screen.getByText('Edit target')).toBeTruthy()
})

it('preserves keyboard focus when entering and leaving the viewport', () => {
  mount()
  fireEvent.focus(screen.getByLabelText('Show target'))
  const content = screen.getByText('Edit target').parentElement
  expect(document.activeElement).toBe(content)
  visibility(false)
  expect(screen.getByText('Edit target')).toBeTruthy()
})

it('keeps interactive editors and menus mounted offscreen', () => {
  mount(true)
  screen.getByText('Edit target').dataset.messageInteractive = 'true'
  visibility(false)
  expect(screen.getByText('Edit target')).toBeTruthy()
})
