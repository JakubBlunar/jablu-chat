import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ForwardMessageModal } from './ForwardMessageModal'
import { requestMessageAction } from '@/lib/messageActions'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { makeChannel, makeMessage } from '@/test/factories'

const mockNavigate = jest.fn().mockResolvedValue(undefined)
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ orchestratedGoToChannel: mockNavigate }) }))
jest.mock('@/components/ui/ModalOverlay', () => ({
  ModalOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))
jest.mock('@/lib/messageActions', () => ({
  requestMessageAction: jest.fn(),
  messageActionError: () => 'confirmation failed'
}))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('@/stores/message.store', () => ({ useMessageStore: { getState: () => ({ loadedForChannelId: null }) } }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useServerStore.setState({ currentServerId: 's' })
  useChannelStore.setState({ channels: [makeChannel('general', 's'), makeChannel('support', 's')] })
  useChannelPermissionsStore.setState({ permissionsMap: {} })
  jest.mocked(requestMessageAction).mockImplementation(async (_event, payload) => ({
    ok: true,
    message: makeMessage({ id: String(payload.clientMessageId) })
  }))
})
afterEach(() => jest.restoreAllMocks())

function setup() {
  const onClose = jest.fn()
  render(
    <ForwardMessageModal
      message={makeMessage({ content: 'Preview this message' })}
      sourceChannelId="general"
      onClose={onClose}
    />
  )
  return { onClose }
}

it('searches and previews without sending on destination selection', () => {
  setup()
  expect(screen.getByText('Preview this message')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'forwardSend' })).toBeDisabled()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'support' } })
  expect(screen.queryByRole('radio', { name: /general/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: /support/ }))
  expect(requestMessageAction).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'forwardSend' })).toBeEnabled()
})

it('stays in the current conversation by default after confirmed forwarding', async () => {
  const { onClose } = setup()
  fireEvent.click(screen.getByRole('radio', { name: /support/ }))
  fireEvent.click(screen.getByRole('button', { name: 'forwardSend' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(mockNavigate).not.toHaveBeenCalled()
})

it('reuses the exact message UUID when retrying an unconfirmed send', async () => {
  jest.mocked(requestMessageAction).mockRejectedValueOnce(new Error('ack lost'))
  const { onClose } = setup()
  fireEvent.click(screen.getByRole('radio', { name: /support/ }))
  fireEvent.click(screen.getByRole('button', { name: 'forwardSend' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('confirmation failed')
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'forwardRetry' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  expect(jest.mocked(requestMessageAction).mock.calls[0][1].clientMessageId).toBe(
    jest.mocked(requestMessageAction).mock.calls[1][1].clientMessageId
  )
})

it('opens the destination only when explicitly requested', async () => {
  setup()
  fireEvent.click(screen.getByRole('radio', { name: /support/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'forwardOpenDestination' }))
  fireEvent.click(screen.getByRole('button', { name: 'forwardSend' }))
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('s', 'support'))
})
