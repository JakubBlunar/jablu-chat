import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MobileBottomNav } from './MobileBottomNav'
import { useLayoutStore } from '@/stores/layout.store'

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: { user: null }) => unknown) => select({ user: null })
}))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => <span aria-hidden /> }))
jest.mock('@/components/notifications/InAppNotificationBell', () => ({
  InAppNotificationBell: () => <button>Inbox</button>
}))

it('opens Chats and You through the existing navigation and settings surfaces', async () => {
  useLayoutStore.setState({ navDrawerOpen: false })
  const settings = jest.fn()
  await act(async () => {
    render(<MobileBottomNav onOpenSettings={settings} />)
  })
  fireEvent.click(screen.getByRole('button', { name: 'mobileChats' }))
  expect(useLayoutStore.getState().navDrawerOpen).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'mobileYou' }))
  expect(settings).toHaveBeenCalledTimes(1)
})

it('hides while composing and returns when focus leaves the composer', async () => {
  render(
    <>
      <MobileBottomNav onOpenSettings={jest.fn()} />
      <div data-message-composer>
        <textarea aria-label="Composer" />
        <button>Send</button>
      </div>
      <button>Outside</button>
    </>
  )
  const nav = screen.getByRole('navigation')
  await act(async () => {
    screen.getByRole('button', { name: 'Send' }).focus()
  })
  expect(nav).toBeVisible()
  await act(async () => {
    screen.getByRole('textbox').focus()
  })
  expect(nav).not.toBeVisible()
  await act(async () => {
    screen.getByRole('button', { name: 'Send' }).focus()
  })
  expect(nav).not.toBeVisible()
  await act(async () => {
    screen.getByRole('button', { name: 'Outside' }).focus()
  })
  expect(nav).toBeVisible()
})

it('does not move Send during the native blur/focus gap', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] })
  try {
    render(
      <>
        <MobileBottomNav onOpenSettings={jest.fn()} />
        <div data-message-composer>
          <textarea aria-label="Composer" />
          <button>Send</button>
        </div>
      </>
    )
    const nav = screen.getByRole('navigation')
    await act(async () => {
      screen.getByRole('textbox').focus()
    })
    await act(async () => {
      screen.getByRole('textbox').blur()
      await Promise.resolve()
    })
    expect(nav).not.toBeVisible()
    await act(async () => {
      screen.getByRole('button', { name: 'Send' }).focus()
      jest.runOnlyPendingTimers()
    })
    expect(nav).not.toBeVisible()
  } finally {
    jest.useRealTimers()
  }
})
