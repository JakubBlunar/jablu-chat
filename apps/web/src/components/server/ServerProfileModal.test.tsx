import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ServerProfileModal } from './ServerProfileModal'
import { api } from '@/lib/api'
import { useMemberStore, type Member } from '@/stores/member.store'

jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn() } }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

const member: Member = {
  userId: 'me',
  serverId: 'one',
  displayName: 'Local Alice',
  bio: 'Local description',
  roleIds: [],
  joinedAt: '',
  user: { id: 'me', username: 'alice', displayName: 'Global Alice', bio: 'Global description', avatarUrl: null }
}

beforeEach(() => {
  jest.clearAllMocks()
  useMemberStore.setState({ members: [member], loadedServerId: 'one' })
})
afterEach(() => jest.restoreAllMocks())

it('edits only the server profile and updates local state', async () => {
  const onClose = jest.fn()
  jest.mocked(api.patch).mockResolvedValue({ displayName: 'New local name', bio: 'New description' })
  render(<ServerProfileModal serverId="one" userId="me" onClose={onClose} />)
  const name = screen.getByLabelText('profileName')
  const bio = screen.getByLabelText('profileDescription')
  expect(name).toHaveAttribute('maxlength', '32')
  expect(bio).toHaveAttribute('maxlength', '1000')
  fireEvent.change(name, { target: { value: 'New local name' } })
  fireEvent.change(bio, { target: { value: 'New description' } })
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await waitFor(() => expect(onClose).toHaveBeenCalled())
  expect(api.patch).toHaveBeenCalledWith('/api/servers/one/members/me/profile', {
    displayName: 'New local name',
    bio: 'New description'
  })
  expect(useMemberStore.getState().members[0].user).toEqual(member.user)
})

it('clears both overrides and requires saving to apply the reset', async () => {
  jest.mocked(api.patch).mockResolvedValue({ displayName: null, bio: null })
  render(<ServerProfileModal serverId="one" userId="me" onClose={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'profileClear' }))
  expect(screen.getByLabelText('profileName')).toHaveValue('')
  expect(screen.getByLabelText('profileDescription')).toHaveValue('')
  expect(api.patch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith('/api/servers/one/members/me/profile', { displayName: '', bio: '' })
  )
})

it('keeps entered data and shows failures without closing', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const onClose = jest.fn()
  jest.mocked(api.patch).mockRejectedValue(new Error('Forbidden'))
  render(<ServerProfileModal serverId="one" userId="me" onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await screen.findByRole('alert')
  expect(screen.getByText('profileSaveError')).toBeInTheDocument()
  expect(screen.getByLabelText('profileName')).toHaveValue('Local Alice')
  expect(onClose).not.toHaveBeenCalled()
})

it('loads and edits an inactive server without replacing the selected server members', async () => {
  const otherMember = { ...member, serverId: 'two', displayName: 'Other name' }
  jest.mocked(api.get).mockResolvedValue([otherMember])
  jest.mocked(api.patch).mockResolvedValue({ displayName: 'Updated other', bio: otherMember.bio })
  render(<ServerProfileModal serverId="two" userId="me" onClose={jest.fn()} />)
  expect(await screen.findByLabelText('profileName')).toHaveValue('Other name')
  expect(api.get).toHaveBeenCalledWith('/api/servers/two/members')
  expect(useMemberStore.getState().loadedServerId).toBe('one')
  expect(useMemberStore.getState().members).toEqual([member])
  fireEvent.change(screen.getByLabelText('profileName'), { target: { value: 'Updated other' } })
  fireEvent.click(screen.getByRole('button', { name: 'profileSave' }))
  await waitFor(() =>
    expect(api.patch).toHaveBeenCalledWith('/api/servers/two/members/me/profile', {
      displayName: 'Updated other',
      bio: otherMember.bio
    })
  )
  expect(useMemberStore.getState().members).toEqual([member])
})
