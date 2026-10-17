import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { DmCall } from '@chat/shared'
import { MemoryRouter } from 'react-router-dom'
import { useDmCallStore } from '@/stores/dmCall.store'
import { useDmStore } from '@/stores/dm.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { playNotifSound } from '@/lib/sounds'
import { DmCallButton } from './DmCallButton'
import { DmCallNotifications } from './DmCallNotifications'
import { DmCallInvitation } from './DmCallInvitation'
import { showNotification } from '@/lib/notifications'

const goToDm = jest.fn()
jest.mock('@/lib/socket', () => ({ getSocket: () => ({ connected: true }) }))
jest.mock('react-i18next', () => ({
  useTranslation: (namespace: string) => ({
    t: (key: string, options?: { name?: string }) => {
      const messages: Record<string, string> = jest.requireActual(`@/i18n/locales/en/${namespace}.json`)
      return (messages[key] ?? key).replace('{{name}}', options?.name ?? '')
    }
  })
}))
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ goToDm }) }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('@/lib/notifications', () => ({
  showNotification: jest.fn(),
  clearNotifications: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@/lib/sounds', () => ({ playNotifSound: jest.fn() }))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (s: { user: { id: string; status: string } }) => unknown) =>
    selector({ user: { id: 'bob', status: 'online' } })
}))
jest.mock('@/stores/dmCall.store', () => {
  const { create }: typeof import('zustand') = jest.requireActual('zustand')
  return {
    useDmCallStore: create(() => ({
      calls: {},
      busy: false,
      error: null,
      syncStatus: 'idle',
      sync: jest.fn(),
      start: jest.fn(),
      accept: jest.fn(),
      decline: jest.fn(),
      clearError: jest.fn()
    }))
  }
})
jest.mock('@/stores/voice-connection.store', () => {
  const { create }: typeof import('zustand') = jest.requireActual('zustand')
  return {
    useVoiceConnectionStore: create((set) => ({
      currentDmCallId: null,
      currentChannelId: null,
      viewingVoiceRoom: false,
      disconnect: jest.fn(),
      setViewingVoiceRoom: (viewingVoiceRoom: boolean) => set({ viewingVoiceRoom })
    }))
  }
})

const call: DmCall = {
  id: 'call',
  conversationId: 'dm',
  callerId: 'alice',
  callerName: 'Alice',
  createdAt: '',
  ringingUntil: '',
  ringingUserIds: ['bob'],
  participants: [{ userId: 'alice', username: 'Alice' }]
}

beforeEach(() => {
  jest.clearAllMocks()
  useDmCallStore.setState({ calls: {}, busy: false, error: null, syncStatus: 'idle' })
  useVoiceConnectionStore.setState({ currentDmCallId: null, currentChannelId: null, viewingVoiceRoom: false })
  jest.mocked(useDmCallStore.getState().start).mockResolvedValue(true)
  jest.mocked(useDmCallStore.getState().accept).mockResolvedValue(true)
  jest.mocked(useDmCallStore.getState().decline).mockResolvedValue(undefined)
  jest.mocked(useDmCallStore.getState().sync).mockResolvedValue(undefined)
})

it('starts a call from the DM header', () => {
  render(<DmCallButton conversationId="dm" />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice call' }))
  expect(useDmCallStore.getState().start).toHaveBeenCalledWith('dm')
})

it('asks before leaving an existing voice connection', () => {
  useVoiceConnectionStore.setState({ currentChannelId: 'server-voice' })
  render(<DmCallButton conversationId="dm" />)
  fireEvent.click(screen.getByRole('button', { name: 'Start voice call' }))
  expect(useDmCallStore.getState().start).not.toHaveBeenCalled()
  expect(screen.getByText('Switch voice connection?')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }))
  expect(useDmCallStore.getState().start).toHaveBeenCalledWith('dm')
})

it('toggles between call and chat without disconnecting', () => {
  useDmCallStore.setState({ calls: { call } })
  useVoiceConnectionStore.setState({ currentDmCallId: 'call', currentChannelId: 'dm', viewingVoiceRoom: true })
  render(<DmCallButton conversationId="dm" />)
  fireEvent.click(screen.getByRole('button', { name: 'Back to messages' }))
  expect(useVoiceConnectionStore.getState().viewingVoiceRoom).toBe(false)
  expect(screen.getByRole('button', { name: 'Go to voice room' })).toBeInTheDocument()
  expect(useVoiceConnectionStore.getState().disconnect).not.toHaveBeenCalled()
})

it('only accepts after clicking Accept and navigates to that conversation', async () => {
  useDmCallStore.setState({ calls: { call } })
  render(<DmCallNotifications />)
  expect(screen.getByRole('dialog', { name: 'Incoming voice call' })).toBeInTheDocument()
  expect(screen.getByText('Alice is calling')).toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  expect(showNotification).toHaveBeenCalledWith(
    'Incoming voice call',
    'Alice is calling',
    '/channels/@me/dm?call=call',
    undefined,
    'friend'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => expect(goToDm).toHaveBeenCalledWith('dm'))
  expect(useDmCallStore.getState().accept).toHaveBeenCalledWith(call)
})

it('declines without joining', () => {
  useDmCallStore.setState({ calls: { call } })
  render(<DmCallNotifications />)
  fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
  expect(useDmCallStore.getState().decline).toHaveBeenCalledWith('call')
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
})

it('identifies a ringing group conversation by its group name', () => {
  useDmStore.setState({
    conversations: [
      {
        id: 'dm',
        isGroup: true,
        groupName: 'Weekend plans',
        createdAt: '',
        members: []
      }
    ]
  })
  useDmCallStore.setState({ calls: { call } })
  render(<DmCallNotifications />)
  expect(screen.getByText('Weekend plans')).toBeInTheDocument()
})

it('stops ringing after another device accepts', () => {
  jest.useFakeTimers()
  try {
    useDmCallStore.setState({ calls: { call } })
    render(<DmCallNotifications />)
    act(() => jest.advanceTimersByTime(4000))
    expect(playNotifSound).toHaveBeenCalledTimes(1)
    act(() => useDmCallStore.setState({ calls: { call: { ...call, ringingUserIds: [] } } }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => jest.advanceTimersByTime(8000))
    expect(playNotifSound).toHaveBeenCalledTimes(1)
  } finally {
    jest.useRealTimers()
  }
})

function renderInvitation(url = '/channels/@me/dm?call=call') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <DmCallInvitation conversationId="dm" />
    </MemoryRouter>
  )
}

it('waits for authoritative call state on a cold notification launch without acquiring media', () => {
  renderInvitation()
  expect(useDmCallStore.getState().sync).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Checking whether this call is still active…')).toBeInTheDocument()
  expect(screen.queryByText('This call has ended.')).not.toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  expect(useDmCallStore.getState().start).not.toHaveBeenCalled()
  act(() => useDmCallStore.setState({ calls: { call }, syncStatus: 'ready' }))
  expect(screen.getByRole('button', { name: 'Join call' })).toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
})

it('offers an explicit join for an active group call even after ringing stops', () => {
  const active = { ...call, ringingUserIds: [], ringingUntil: null }
  useDmCallStore.setState({ calls: { call: active }, syncStatus: 'ready' })
  renderInvitation()
  expect(screen.getByText('This voice call is still active. Join when you are ready.')).toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }))
  expect(useDmCallStore.getState().accept).toHaveBeenCalledWith(active)
  expect(useDmCallStore.getState().start).not.toHaveBeenCalled()
})

it('shows ended for an old invitation rather than joining a newer call in the same DM', () => {
  useDmCallStore.setState({ calls: { newer: { ...call, id: 'newer' } }, syncStatus: 'ready' })
  renderInvitation()
  expect(screen.getByText('This call has ended.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Join call' })).not.toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  expect(useDmCallStore.getState().start).not.toHaveBeenCalled()
})

it('does not offer a call belonging to a different conversation', () => {
  useDmCallStore.setState({ calls: { call: { ...call, conversationId: 'other' } }, syncStatus: 'ready' })
  renderInvitation()
  expect(screen.getByText('This call has ended.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Join call' })).not.toBeInTheDocument()
})

it('shows a retry action rather than claiming a call ended when checking fails', () => {
  useDmCallStore.setState({ syncStatus: 'error' })
  renderInvitation()
  expect(screen.getByText('Could not check this call. Reconnect or try again.')).toBeInTheDocument()
  expect(screen.queryByText('This call has ended.')).not.toBeInTheDocument()
  jest.mocked(useDmCallStore.getState().sync).mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(useDmCallStore.getState().sync).toHaveBeenCalledTimes(1)
})

it('confirms switching from server voice before joining the invitation', () => {
  useDmCallStore.setState({ calls: { call }, syncStatus: 'ready' })
  useVoiceConnectionStore.setState({ currentChannelId: 'server-voice' })
  renderInvitation()
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }))
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Join call' }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Join call' }))
  expect(useDmCallStore.getState().accept).toHaveBeenCalledWith(call)
})

it('does not offer to join again on another device or show a banner for the local call', () => {
  useDmCallStore.setState({
    calls: { call: { ...call, participants: [...call.participants, { userId: 'bob', username: 'Bob' }] } },
    syncStatus: 'ready'
  })
  renderInvitation()
  expect(screen.getByText('You already joined this call on another device.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Join call' })).not.toBeInTheDocument()
  act(() => useVoiceConnectionStore.setState({ currentDmCallId: 'call', currentChannelId: 'dm' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('dismisses the invitation without joining or starting a call', () => {
  useDmCallStore.setState({ syncStatus: 'ready' })
  renderInvitation()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(useDmCallStore.getState().accept).not.toHaveBeenCalled()
  expect(useDmCallStore.getState().start).not.toHaveBeenCalled()
})

it('does not show an invitation for an ordinary DM link', () => {
  renderInvitation('/channels/@me/dm')
  expect(useDmCallStore.getState().sync).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
