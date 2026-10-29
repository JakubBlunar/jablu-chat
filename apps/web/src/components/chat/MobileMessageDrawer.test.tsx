import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MobileMessageDrawer } from './MobileMessageDrawer'
import { copyMessageContent } from '@/lib/messageClipboard'
import { useTranslationStore } from '@/stores/translation.store'
import { makeMessage } from '@/test/factories'
import { useAuthStore } from '@/stores/auth.store'

jest.mock('@/components/ui/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
jest.mock('@/lib/messageClipboard', () => ({ copyMessageContent: jest.fn(), shareMessageLink: jest.fn() }))
jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))
jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => true }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
beforeEach(() => {
  jest.clearAllMocks()
  useTranslationStore.setState(
    {
      ...useTranslationStore.getInitialState(),
      fetchCapabilities: jest.fn().mockResolvedValue(undefined),
      loadPreference: jest.fn().mockResolvedValue(undefined)
    },
    true
  )
})

it('retains the drawer on clipboard failure and closes only after a successful copy', async () => {
  const onClose = jest.fn()
  jest.mocked(copyMessageContent).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  render(
    <MobileMessageDrawer
      message={makeMessage()}
      mode="dm"
      contextId="dm"
      onClose={onClose}
      onReply={jest.fn()}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'actionCopyText' }))
  await waitFor(() => expect(copyMessageContent).toHaveBeenCalledTimes(1))
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'actionCopyText' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
})

it("does not offer deleting someone else's DM based on server permissions", () => {
  render(
    <MobileMessageDrawer
      message={makeMessage()}
      mode="dm"
      contextId="dm"
      onClose={jest.fn()}
      onReply={jest.fn()}
    />
  )
  expect(screen.queryByRole('button', { name: 'actionDelete' })).not.toBeInTheDocument()
})

it('puts editing first in the action list for an own message', () => {
  useAuthStore.setState({ user: { id: 'user-1' } } as never)
  const edit = jest.fn()
  render(
    <MobileMessageDrawer message={makeMessage()} mode="dm" contextId="dm" onClose={jest.fn()} onReply={jest.fn()} onEdit={edit} />
  )
  const editButton = screen.getByRole('button', { name: 'actionEdit' })
  expect(editButton.parentElement?.firstElementChild).toBe(editButton)
  fireEvent.click(editButton)
  expect(edit).toHaveBeenCalledTimes(1)
  useAuthStore.setState({ user: null })
})
