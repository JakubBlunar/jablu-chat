import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ServerNotifModal } from './ServerNotifModal'
import { useChannelStore } from '@/stores/channel.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { api } from '@/lib/api'
import { makeChannel } from '@/test/factories'

jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), setNotifPref: jest.fn(), setServerNotifPref: jest.fn() } }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

const selectedChannels = [makeChannel('general', 'one')]
beforeEach(() => {
  jest.clearAllMocks()
  useChannelStore.setState({ channels: selectedChannels, loadedServerId: 'one' })
  useNotifPrefStore.setState({ prefs: { other: 'mentions' }, serverPrefs: {} })
  jest.mocked(api.setNotifPref).mockResolvedValue({ level: 'none' })
})

it('loads overrides for the target server without changing the selected server channels', async () => {
  jest.mocked(api.get).mockResolvedValue([makeChannel('other', 'two')])
  render(<ServerNotifModal serverId="two" serverName="Other" onClose={jest.fn()} />)
  const override = await screen.findByRole('combobox', { name: '# other' })
  expect(override).toHaveValue('mentions')
  expect(screen.queryByText('# general')).not.toBeInTheDocument()
  expect(useChannelStore.getState().channels).toEqual(selectedChannels)
  expect(useChannelStore.getState().loadedServerId).toBe('one')
  fireEvent.change(override, { target: { value: 'none' } })
  await waitFor(() => expect(api.setNotifPref).toHaveBeenCalledWith('other', 'none'))
  expect(useNotifPrefStore.getState().prefs.other).toBe('none')
})

it('reports a channel-load failure while keeping the target server defaults usable', async () => {
  jest.mocked(api.get).mockRejectedValue(new Error('Offline'))
  jest.mocked(api.setServerNotifPref).mockResolvedValue({ level: 'mentions' })
  render(<ServerNotifModal serverId="two" serverName="Other" onClose={jest.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('notifications.channelLoadFailed')
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /notifications.mentionsOnly/ }))
  await waitFor(() => expect(api.setServerNotifPref).toHaveBeenCalledWith('two', 'mentions'))
})
