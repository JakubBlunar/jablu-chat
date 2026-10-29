import 'fake-indexeddb/auto'
import '@testing-library/jest-dom'
import { useRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MobileMessageDrawer } from './MobileMessageDrawer'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { useMessageComposer } from './hooks/useMessageComposer'
import { useTranslationStore } from '@/stores/translation.store'
import { makeMessage } from '@/test/factories'

jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'reply-owner', username: 'Alice' } })) }
})
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('@/components/notifications/InAppNotificationBell', () => ({ InAppNotificationBell: () => null }))
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => false }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
jest.mock('@/components/chat/useBotCommands', () => ({ useBotCommands: () => [] }))
jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => true }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))

it.each(['channel', 'dm'] as const)(
  'hands focus from the real reply sheet to the %s composer during the tap',
  async (mode) => {
    useTranslationStore.setState({
      fetchCapabilities: jest.fn().mockResolvedValue(undefined),
      loadPreference: jest.fn().mockResolvedValue(undefined)
    })
    const handoff = jest.fn()
    function Chat() {
      const [open, setOpen] = useState(false)
      const [reply, setReply] = useState<{ id: string; content: string; authorName: string } | null>(null)
      const textarea = useRef<HTMLTextAreaElement>(null)
      const { inputRef } = useMessageComposer({
        mode,
        contextId: 'conversation',
        placeholder: 'Message',
        replyTarget: reply,
        onCancelReply: () => {}
      })
      return (
        <>
          <button onClick={() => setOpen(true)}>Message actions</button>
          <div data-message-composer>
            <textarea
              ref={(element) => {
                textarea.current = element
                inputRef.current = element ? { focus: () => element.focus(), dismissPopup: () => {} } : null
              }}
              aria-label="Composer"
            />
            <button>Send</button>
          </div>
          <button>Outside</button>
          <MobileBottomNav onOpenSettings={() => {}} />
          {open && (
            <MobileMessageDrawer
              message={makeMessage()}
              mode={mode}
              contextId="conversation"
              onClose={() => setOpen(false)}
              onReply={() => {
                // A real browser refuses to focus the composer while this root is inert.
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
                expect(textarea.current?.closest('[inert]')).toBeNull()
                expect(screen.getByRole('button', { name: 'Message actions' }).parentElement?.inert).not.toBe(true)
                setReply({ id: 'parent', content: 'Question', authorName: 'Bob' })
                handoff()
              }}
            />
          )}
        </>
      )
    }
    render(<Chat />)
    const nav = screen.getByRole('navigation')
    fireEvent.click(screen.getByRole('button', { name: 'Message actions' }))
    await waitFor(() => expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true))
    // The body listener runs after React's delegated portal click handler. Focus
    // must already be in the composer before this same click finishes bubbling.
    const duringTap = jest.fn(() => expect(screen.getByRole('textbox')).toHaveFocus())
    document.body.addEventListener('click', duringTap, { once: true })
    fireEvent.click(screen.getByRole('button', { name: 'actionReply' }))
    expect(handoff).toHaveBeenCalledTimes(1)
    expect(duringTap).toHaveBeenCalledTimes(1)
    expect(nav).not.toBeVisible()
    await act(async () => screen.getByRole('button', { name: 'Send' }).focus())
    expect(nav).not.toBeVisible()
    await act(async () => screen.getByRole('button', { name: 'Outside' }).focus())
    expect(nav).toBeVisible()
  }
)
