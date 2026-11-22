import { act, render, screen } from '@testing-library/react'
import { useIsMobile } from './useMobile'

it('shares one native listener, observes a breakpoint change and detaches after the last consumer', () => {
  let matches = false
  let notify!: () => void
  const original = window.matchMedia
  const add = jest.fn((_type: string, listener: () => void) => {
    notify = listener
  })
  const remove = jest.fn()
  window.matchMedia = jest.fn(
    () =>
      ({
        get matches() {
          return matches
        },
        addEventListener: add,
        removeEventListener: remove
      }) as unknown as MediaQueryList
  )
  function Consumer() {
    return <span>{useIsMobile() ? 'phone' : 'desktop'}</span>
  }
  try {
    const view = render(
      <>
        <Consumer />
        <Consumer />
      </>
    )
    expect(add).toHaveBeenCalledTimes(1)
    view.rerender(
      <>
        <Consumer />
        <Consumer />
      </>
    )
    expect(remove).not.toHaveBeenCalled()
    act(() => {
      matches = true
      notify()
    })
    expect(screen.getAllByText('phone')).toHaveLength(2)
    view.rerender(
      <>
        <Consumer />
      </>
    )
    expect(remove).not.toHaveBeenCalled()
    view.unmount()
    expect(remove).toHaveBeenCalledTimes(1)
  } finally {
    window.matchMedia = original
  }
})
