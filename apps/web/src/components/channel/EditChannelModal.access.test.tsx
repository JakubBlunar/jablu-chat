import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Permission, type ChannelAccessContext } from '@chat/shared'
import { api, ApiError } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useServerStore } from '@/stores/server.store'
import { makeChannel } from '@/test/factories'
import { EditChannelModal } from './EditChannelModal'

jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ goToServer: jest.fn() }) }))
jest.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ has: () => true }) }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('react-i18next', () => {
  const channels = jest.requireActual('../../i18n/locales/en/channels.json')
  const common = jest.requireActual('../../i18n/locales/en/common.json')
  const translate =
    (data: Record<string, unknown>) =>
    (key: string, values: Record<string, unknown> = {}) => {
      const text = key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], data)
      return typeof text === 'string' ? text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? '')) : key
    }
  const channelT = translate(channels),
    commonT = translate(common)
  return { useTranslation: (namespace: string) => ({ t: namespace === 'common' ? commonT : channelT }) }
})

const role = (id: string, permissions: bigint, isDefault = false) => ({
  id,
  serverId: 'server',
  name: id,
  permissions: permissions.toString(),
  isDefault,
  color: null,
  position: 0,
  selfAssignable: false,
  isAdmin: false,
  createdAt: ''
})
const member = (userId: string, roleIds: string[]) => ({
  userId,
  roleIds,
  username: userId,
  displayName: null,
  avatarUrl: null
})
const context: ChannelAccessContext = {
  ownerId: 'Oliver',
  roles: [
    role('@everyone', Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES, true),
    role('Team', 0n),
    role('Guests', 0n),
    role('Admin', Permission.ADMINISTRATOR)
  ],
  overrides: [
    { roleId: '@everyone', allow: '0', deny: Permission.VIEW_CHANNEL.toString() },
    {
      roleId: 'Team',
      allow: (Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES | Permission.MANAGE_MESSAGES).toString(),
      deny: '0'
    },
    { roleId: 'Guests', allow: '0', deny: (Permission.VIEW_CHANNEL | Permission.SEND_MESSAGES).toString() }
  ],
  members: [
    member('Maya', ['Team']),
    member('Leo', ['Team', 'Guests']),
    member('Nora', ['Guests']),
    member('Ivo', []),
    member('Eva', ['Admin']),
    member('Oliver', [])
  ]
}

beforeEach(() => {
  jest.restoreAllMocks()
  useServerStore.setState({ currentServerId: 'server' })
  useChannelStore.setState({ categories: [], fetchChannels: jest.fn().mockResolvedValue(undefined) })
  useChannelPermissionsStore.setState({ fetchChannelPermissions: jest.fn().mockResolvedValue(undefined) })
  jest.spyOn(api, 'getChannelAccess').mockResolvedValue(context)
  jest
    .spyOn(api, 'saveChannelAccess')
    .mockImplementation(async (_server, _channel, data) => ({ overrides: data.overrides }))
})

async function open(type: 'text' | 'voice' = 'text') {
  const close = jest.fn()
  render(<EditChannelModal channel={makeChannel('channel', 'server', { type })} onClose={close} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Access' }))
  await screen.findByText('4 of 6 members can see this channel')
  return close
}

it('shares unsaved rules across both views and settings sections, with correct conflicts and impact', async () => {
  await open()
  fireEvent.click(screen.getByRole('button', { name: /Leo/ }))
  expect(screen.getAllByText('The explicit Allow wins over the conflicting Deny.')).toHaveLength(2)
  fireEvent.click(screen.getByRole('tab', { name: 'Rule inspector' }))
  fireEvent.click(screen.getByRole('button', { name: /^Team/ }))
  fireEvent.change(screen.getByLabelText('View channel for Team'), { target: { value: 'inherit' } })
  expect(screen.getByText('2 of 6 members can see this channel')).not.toBeNull()
  expect(screen.getByRole('status').textContent).toContain('0 gain visibility · 2 lose visibility')
  fireEvent.click(screen.getByRole('tab', { name: 'Audience' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Access' }))
  expect(screen.getByText('2 of 6 members can see this channel')).not.toBeNull()
  expect(api.getChannelAccess).toHaveBeenCalledTimes(1)
  expect(api.saveChannelAccess).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Discard access changes' }))
  expect(screen.getByText('4 of 6 members can see this channel')).not.toBeNull()
})

it('stages removal, warns on closing, and saves the complete draft once', async () => {
  const close = await open()
  fireEvent.click(screen.getByRole('tab', { name: 'Rule inspector' }))
  fireEvent.click(screen.getByRole('button', { name: /^Team/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Remove this role’s channel rules' }))
  expect(api.saveChannelAccess).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('You have unsaved changes. Discard them and close?')).not.toBeNull()
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(api.saveChannelAccess).toHaveBeenCalledTimes(1)
  expect(api.saveChannelAccess).toHaveBeenCalledWith('server', 'channel', {
    expectedOverrides: context.overrides,
    overrides: context.overrides.filter((rule) => rule.roleId !== 'Team')
  })
})

it('preserves unedited bits and keeps a failed/conflicting draft available for review', async () => {
  await open()
  jest.mocked(api.saveChannelAccess).mockRejectedValue(new ApiError('Conflict', 409, null))
  fireEvent.click(screen.getByRole('tab', { name: 'Rule inspector' }))
  fireEvent.click(screen.getByRole('button', { name: /^Team/ }))
  fireEvent.change(screen.getByLabelText('Send messages for Team'), { target: { value: 'inherit' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText(
    'Channel rules changed while you were editing. Reload access to review the latest rules before saving.'
  )
  expect((screen.getByLabelText('Send messages for Team') as HTMLSelectElement).value).toBe('inherit')
  const sent = jest.mocked(api.saveChannelAccess).mock.calls[0][2].overrides.find((rule) => rule.roleId === 'Team')!
  expect(BigInt(sent.allow) & Permission.MANAGE_MESSAGES).toBe(Permission.MANAGE_MESSAGES)
  expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(true)
})

it('shows a visible load error instead of treating a failed load as an empty audience', async () => {
  jest.mocked(api.getChannelAccess).mockRejectedValue(new Error('Offline'))
  render(<EditChannelModal channel={makeChannel('channel', 'server')} onClose={jest.fn()} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Access' }))
  await screen.findByText('Could not load channel access. Try again.')
  expect(screen.queryByText('0 of 0 members can see this channel')).toBeNull()
})

it('limits voice rules to visibility while preserving stored send and other bits', async () => {
  await open('voice')
  fireEvent.click(screen.getByRole('tab', { name: 'Rule inspector' }))
  fireEvent.click(screen.getByRole('button', { name: /^Team/ }))
  expect(screen.queryByLabelText('Send messages for Team')).toBeNull()
  fireEvent.change(screen.getByLabelText('View channel for Team'), { target: { value: 'inherit' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(api.saveChannelAccess).toHaveBeenCalledTimes(1))
  const sent = jest.mocked(api.saveChannelAccess).mock.calls[0][2].overrides.find((rule) => rule.roleId === 'Team')!
  expect(BigInt(sent.allow) & Permission.SEND_MESSAGES).toBe(Permission.SEND_MESSAGES)
})
