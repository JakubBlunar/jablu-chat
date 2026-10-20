import '@testing-library/jest-dom'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProfileCard, type ProfileCardUser } from './ProfileCard'
import { useIsMobile } from '@/hooks/useMobile'
import { api } from '@/lib/api'
import { useProfileCardStore } from '@/stores/profileCard.store'
import { useServerStore } from '@/stores/server.store'
import { makeServer } from '@/test/factories'
import { useMemberStore, type Member } from '@/stores/member.store'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: jest.fn(() => false) }))
jest.mock('@/hooks/useAppNavigate', () => ({
  useAppNavigate: () => ({ goToDm: jest.fn(), orchestratedGoToChannel: jest.fn() })
}))
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'self' } })
}))
jest.mock('@/stores/voice-connection.store', () => ({
  useVoiceConnectionStore: (
    select: (state: { currentChannelId: null; volumeOverrides: object; setVolumeOverride: () => void }) => unknown
  ) => select({ currentChannelId: null, volumeOverrides: {}, setVolumeOverride: jest.fn() })
}))
jest.mock('@/stores/voice.store', () => ({
  useVoiceStore: (select: (state: { participants: object }) => unknown) => select({ participants: {} })
}))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/lib/api', () => ({
  api: {
    getMutualServers: jest.fn(),
    getMutualFriends: jest.fn(),
    getFriendshipStatus: jest.fn(),
    canDmUser: jest.fn(),
    getMemberXpProgress: jest.fn(),
    acceptFriendRequest: jest.fn()
  },
  resolveMediaUrl: (path: string) => path
}))

const user: ProfileCardUser = { id: 'self', username: 'Alice', status: 'offline' }
const otherUser: ProfileCardUser = { id: 'other', username: 'Bob', status: 'offline' }
const xp = { xp: 100, level: 1, xpIntoLevel: 0, xpNeededForLevel: 200, nextLevelAt: 300 }
const originalObserver = globalThis.ResizeObserver
let cardHeight = 400
let resizeCard = () => {}
let disconnect: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  useProfileCardStore.setState({ cache: new Map(), inflight: new Map() })
  useServerStore.setState({ servers: [], currentServerId: null })
  useMemberStore.setState({ members: [] })
  jest.mocked(api.getMutualServers).mockResolvedValue({ servers: [] })
  jest.mocked(api.getMutualFriends).mockResolvedValue({ friends: [] })
  jest.mocked(api.getFriendshipStatus).mockResolvedValue({ status: 'none', friendshipId: null })
  jest.mocked(api.canDmUser).mockResolvedValue({ allowed: true })
  jest.mocked(api.getMemberXpProgress).mockResolvedValue(xp)
  jest.mocked(api.acceptFriendRequest).mockResolvedValue({ ok: true })
  jest.mocked(useIsMobile).mockReturnValue(false)
  jest.replaceProperty(window, 'innerWidth', 1024)
  jest.replaceProperty(window, 'innerHeight', 768)
  cardHeight = 400
  disconnect = jest.fn()
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCard = () => callback([], this)
    }
    observe() {}
    unobserve() {}
    disconnect = disconnect
  }
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.getAttribute('role') !== 'dialog') return new DOMRect()
    return new DOMRect(
      Number.parseFloat(this.style.left) || 0,
      Number.parseFloat(this.style.top) || 0,
      Math.min(300, window.innerWidth - 16),
      Math.min(cardHeight, window.innerHeight - 16)
    )
  })
})

afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = originalObserver
  jest.restoreAllMocks()
})

function expectWithinViewport(card: HTMLElement) {
  const bounds = card.getBoundingClientRect()
  expect(bounds.left).toBeGreaterThanOrEqual(8)
  expect(bounds.top).toBeGreaterThanOrEqual(8)
  expect(bounds.right).toBeLessThanOrEqual(window.innerWidth - 8)
  expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight - 8)
}

it('shows a live server name and description only for server-context profiles', () => {
  const member: Member = {
    userId: 'self', serverId: 'one', roleIds: [], joinedAt: '',
    displayName: 'Local Alice', bio: 'Server description',
    user: { id: 'self', username: 'Alice', displayName: 'Global Alice', bio: null, avatarUrl: null }
  }
  useMemberStore.setState({ members: [member] })
  const { rerender } = render(<ProfileCard user={{ ...user, serverId: 'one' }} onClose={jest.fn()} anchorRect={null} />)
  expect(screen.getByRole('dialog', { name: 'Local Alice' })).toBeInTheDocument()
  expect(screen.getByText('Server description')).toBeInTheDocument()
  act(() => useMemberStore.getState().updateServerProfile('one', 'self', { displayName: 'Moderated name', bio: null }))
  expect(screen.getByRole('dialog', { name: 'Moderated name' })).toBeInTheDocument()
  expect(screen.queryByText('Server description')).not.toBeInTheDocument()
  rerender(<ProfileCard user={user} onClose={jest.fn()} anchorRect={null} />)
  expect(screen.getByRole('dialog', { name: 'Alice' })).toBeInTheDocument()
  expect(screen.queryByText('Moderated name')).not.toBeInTheDocument()
})

it.each([
  ['top left', new DOMRect(0, 0, 40, 20)],
  ['top right', new DOMRect(984, 0, 40, 20)],
  ['bottom left', new DOMRect(0, 748, 40, 20)],
  ['bottom right', new DOMRect(984, 748, 40, 20)],
  ['outside the viewport', new DOMRect(1100, 900, 40, 20)]
])('keeps the entire profile visible at the %s', (_label, anchorRect) => {
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={anchorRect} />)
  expectWithinViewport(screen.getByRole('dialog', { name: 'Alice' }))
})

it('uses the measured width when deciding whether to open to the right', () => {
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(660, 100, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ left: '708px', top: '100px' })
})

it('opens to the left when there is no room to the right', () => {
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(900, 100, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ left: '592px', top: '100px' })
})

it('opens upwards using its actual height instead of a fixed estimate', () => {
  cardHeight = 600
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 650, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ top: '70px' })
  expectWithinViewport(screen.getByRole('dialog'))
})

it('keeps oversized content scrollable inside the viewport', () => {
  jest.replaceProperty(window, 'innerHeight', 300)
  cardHeight = 1000
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 250, 40, 20)} />)
  const card = screen.getByRole('dialog')
  expect(card).toHaveClass('max-h-[calc(100dvh-16px)]', 'overflow-y-auto', 'overscroll-contain')
  expect(card).toHaveStyle({ top: '8px' })
  expectWithinViewport(card)
})

it('fits narrow windows and centers when neither side has enough room', () => {
  jest.replaceProperty(window, 'innerWidth', 280)
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(120, 100, 40, 20)} />)
  const card = screen.getByRole('dialog')
  expect(card).toHaveClass('max-w-[calc(100vw-16px)]')
  expect(card).toHaveStyle({ left: '8px' })
  expectWithinViewport(card)
})

it('recenters an unanchored profile rather than leaving it in document flow', () => {
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={null} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ left: '362px', top: '184px' })
})

it('repositions when live content changes after the initial reveal', () => {
  cardHeight = 200
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ top: '500px' })
  act(() => {
    cardHeight = 600
    resizeCard()
  })
  expect(screen.getByRole('dialog')).toHaveStyle({ top: '8px' })
  expectWithinViewport(screen.getByRole('dialog'))
})

it('recalculates bounds after the browser window is resized', () => {
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(900, 700, 40, 20)} />)
  act(() => {
    jest.replaceProperty(window, 'innerWidth', 800)
    jest.replaceProperty(window, 'innerHeight', 400)
    fireEvent(window, new Event('resize'))
  })
  expectWithinViewport(screen.getByRole('dialog'))
})

it('updates position when a different anchor is selected', () => {
  const { rerender } = render(
    <ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 100, 40, 20)} />
  )
  rerender(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(900, 700, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveStyle({ left: '592px', top: '320px' })
})

it('portals outside clipping ancestors and preserves outside-click and Escape dismissal', () => {
  const onClose = jest.fn()
  const { container } = render(<ProfileCard user={user} onClose={onClose} anchorRect={new DOMRect(100, 100, 40, 20)} />)
  const card = screen.getByRole('dialog')
  expect(card.parentElement).toBe(document.body)
  expect(container).toBeEmptyDOMElement()
  fireEvent.pointerDown(card)
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.pointerDown(document.body)
  expect(onClose).toHaveBeenCalledTimes(1)
  onClose.mockClear()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
})

it('disconnects observers and resize listeners on dismissal', () => {
  const { unmount } = render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 100, 40, 20)} />)
  unmount()
  expect(disconnect).toHaveBeenCalledTimes(1)
  jest.mocked(HTMLElement.prototype.getBoundingClientRect).mockClear()
  fireEvent(window, new Event('resize'))
  expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled()
})

it('preserves the mobile modal presentation', () => {
  jest.mocked(useIsMobile).mockReturnValue(true)
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 100, 40, 20)} />)
  expect(screen.getByRole('dialog')).toHaveClass('max-h-[80vh]', 'overflow-y-auto')
  expect(disconnect).not.toHaveBeenCalled()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

function enableXp() {
  useServerStore.setState({
    currentServerId: 'server',
    servers: [{ ...makeServer('server'), memberCount: 2, xpEnabled: true }]
  })
}

it.each(['details', 'permissions', 'xp'] as const)(
  'stays hidden until %s finishes last, then reveals at the completed position',
  async (last) => {
    enableXp()
    const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
    const permissions = deferred<Awaited<ReturnType<typeof api.canDmUser>>>()
    const progress = deferred<Awaited<ReturnType<typeof api.getMemberXpProgress>>>()
    jest.mocked(api.getMutualServers).mockReturnValue(details.promise)
    jest.mocked(api.canDmUser).mockReturnValue(permissions.promise)
    jest.mocked(api.getMemberXpProgress).mockReturnValue(progress.promise)
    const finish = {
      details: () =>
        details.resolve({ servers: [{ id: 'mutual', name: 'Shared server', iconUrl: null, channels: [] }] }),
      permissions: () => permissions.resolve({ allowed: false }),
      xp: () => progress.resolve(xp)
    }
    const { container } = render(
      <ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />
    )
    const card = screen.getByRole('dialog', { hidden: true })
    expect(card).not.toBeVisible()
    expect(card).not.toHaveAttribute('tabindex')
    expect(container.inert).not.toBe(true)
    await act(async () => {
      for (const name of ['details', 'permissions', 'xp'] as const) {
        if (name !== last) finish[name]()
      }
    })
    expect(card).not.toBeVisible()
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled()
    await act(async () => {
      cardHeight = 600
      finish[last]()
    })
    expect(card).toBeVisible()
    expect(card).toHaveAttribute('aria-busy', 'false')
    expect(card).toHaveAttribute('tabindex', '-1')
    expect(card).toHaveStyle({ top: '8px' })
    expect(screen.getByText('Shared server')).toBeInTheDocument()
    expect(screen.getByText('Level 1')).toBeInTheDocument()
    expect(screen.getByText('Become friends to send messages.')).toBeInTheDocument()
    expectWithinViewport(card)
    expect(api.canDmUser).toHaveBeenCalledTimes(1)
  }
)

it('uses fresh cached details without fetching them again', async () => {
  useProfileCardStore.setState({
    cache: new Map([
      [
        otherUser.id,
        {
          mutualServers: [{ id: 'cached', name: 'Cached server', iconUrl: null }],
          mutualFriends: [],
          friendshipStatus: { status: 'none', friendshipId: null },
          fetchedAt: Date.now()
        }
      ]
    ])
  })
  render(<ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
  expect(await screen.findByRole('dialog', { name: 'Bob' })).toBeVisible()
  expect(screen.getByText('Cached server')).toBeInTheDocument()
  expect(api.getMutualServers).not.toHaveBeenCalled()
  expect(api.canDmUser).toHaveBeenCalledTimes(1)
})

it('waits for member XP on the current user without requesting mutual details or messaging permissions', async () => {
  enableXp()
  const progress = deferred<Awaited<ReturnType<typeof api.getMemberXpProgress>>>()
  jest.mocked(api.getMemberXpProgress).mockReturnValue(progress.promise)
  render(<ProfileCard user={user} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  await act(async () => progress.resolve(xp))
  expect(screen.getByRole('dialog', { name: 'Alice' })).toBeVisible()
  expect(screen.getByText('Level 1')).toBeInTheDocument()
  expect(api.getMutualServers).not.toHaveBeenCalled()
  expect(api.canDmUser).not.toHaveBeenCalled()
})

it('waits for an in-flight stale-cache refresh before showing the card', async () => {
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  jest.mocked(api.getMutualServers).mockReturnValue(details.promise)
  useProfileCardStore.setState({
    cache: new Map([
      [
        otherUser.id,
        {
          mutualServers: [{ id: 'stale', name: 'Stale server', iconUrl: null }],
          mutualFriends: [],
          friendshipStatus: { status: 'none', friendshipId: null },
          fetchedAt: Date.now() - 60_001
        }
      ]
    ])
  })
  render(<ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
  await act(async () => {})
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  await act(async () =>
    details.resolve({ servers: [{ id: 'fresh', name: 'Fresh server', iconUrl: null, channels: [] }] })
  )
  expect(screen.getByRole('dialog', { name: 'Bob' })).toBeVisible()
  expect(screen.getByText('Fresh server')).toBeInTheDocument()
  expect(screen.queryByText('Stale server')).not.toBeInTheDocument()
})

it.each(['permissions', 'details', 'xp'] as const)(
  'reveals an explicit error after a failed %s load',
  async (source) => {
    enableXp()
    const error = new Error('Offline')
    const log = jest.spyOn(console, 'error').mockImplementation(() => {})
    if (source === 'permissions') jest.mocked(api.canDmUser).mockRejectedValue(error)
    if (source === 'details') jest.mocked(api.getMutualServers).mockRejectedValue(error)
    if (source === 'xp') jest.mocked(api.getMemberXpProgress).mockRejectedValue(error)
    render(<ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
    expect(await screen.findByRole('dialog', { name: 'Bob' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('profileLoadFailed')
    expect(log).toHaveBeenCalledWith('Could not load profile content', error)
    if (source === 'permissions') expect(screen.getByRole('button', { name: 'Message' })).toBeDisabled()
  }
)

it('can be dismissed while loading without trapping focus or revealing after dismissal', async () => {
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  jest.mocked(api.getMutualServers).mockReturnValue(details.promise)
  const onClose = jest.fn()
  const { unmount } = render(
    <ProfileCard user={otherUser} onClose={onClose} anchorRect={new DOMRect(100, 500, 40, 20)} />
  )
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  onClose.mockClear()
  fireEvent.pointerDown(document.body)
  expect(onClose).toHaveBeenCalledTimes(1)
  unmount()
  await act(async () => details.resolve({ servers: [] }))
  expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  expect(disconnect).not.toHaveBeenCalled()
})

it('does not reveal stale content when a different user is selected while loading', async () => {
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  jest
    .mocked(api.getMutualServers)
    .mockImplementation((id) => (id === otherUser.id ? details.promise : Promise.resolve({ servers: [] })))
  const { rerender } = render(
    <ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />
  )
  rerender(
    <ProfileCard
      user={{ ...otherUser, id: 'new-user', username: 'Carol' }}
      onClose={jest.fn()}
      anchorRect={new DOMRect(500, 100, 40, 20)}
    />
  )
  expect(await screen.findByRole('dialog', { name: 'Carol' })).toBeVisible()
  await act(async () =>
    details.resolve({ servers: [{ id: 'old', name: 'Old profile server', iconUrl: null, channels: [] }] })
  )
  expect(screen.getByRole('dialog', { name: 'Carol' })).toBeVisible()
  expect(screen.queryByText('Old profile server')).not.toBeInTheDocument()
})

it('hides an already visible card until the newly selected user has finished loading', async () => {
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  jest
    .mocked(api.getMutualServers)
    .mockImplementation((id) => (id === 'new-user' ? details.promise : Promise.resolve({ servers: [] })))
  const onClose = jest.fn()
  const { rerender } = render(
    <ProfileCard user={otherUser} onClose={onClose} anchorRect={new DOMRect(100, 100, 40, 20)} />
  )
  expect(await screen.findByRole('dialog', { name: 'Bob' })).toBeVisible()
  rerender(
    <ProfileCard
      user={{ ...otherUser, id: 'new-user', username: 'Carol' }}
      onClose={onClose}
      anchorRect={new DOMRect(900, 700, 40, 20)}
    />
  )
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  await act(async () => {
    cardHeight = 600
    details.resolve({ servers: [] })
  })
  expect(screen.getByRole('dialog', { name: 'Carol' })).toHaveStyle({ left: '592px', top: '120px' })
})

it('waits again when returning to a previously visible user before another profile has loaded', async () => {
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  const permissions = deferred<Awaited<ReturnType<typeof api.canDmUser>>>()
  jest
    .mocked(api.getMutualServers)
    .mockImplementation((id) => (id === 'new-user' ? details.promise : Promise.resolve({ servers: [] })))
  const onClose = jest.fn()
  const anchorRect = new DOMRect(100, 100, 40, 20)
  const { rerender } = render(<ProfileCard user={otherUser} onClose={onClose} anchorRect={anchorRect} />)
  expect(await screen.findByRole('dialog', { name: 'Bob' })).toBeVisible()
  rerender(
    <ProfileCard user={{ ...otherUser, id: 'new-user', username: 'Carol' }} onClose={onClose} anchorRect={anchorRect} />
  )
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  jest.mocked(api.canDmUser).mockReturnValueOnce(permissions.promise)
  rerender(<ProfileCard user={otherUser} onClose={onClose} anchorRect={anchorRect} />)
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  await act(async () => permissions.resolve({ allowed: true }))
  expect(screen.getByRole('dialog', { name: 'Bob' })).toBeVisible()
  await act(async () => details.resolve({ servers: [] }))
  expect(screen.getByRole('dialog', { name: 'Bob' })).toBeVisible()
})

it('refreshes messaging permissions after a friendship action without duplicating the initial request', async () => {
  jest.mocked(api.getFriendshipStatus).mockResolvedValue({ status: 'pending_incoming', friendshipId: 'friend' })
  jest.mocked(api.canDmUser).mockResolvedValueOnce({ allowed: false }).mockResolvedValueOnce({ allowed: true })
  render(<ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 100, 40, 20)} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Accept Request' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Message' })).toBeEnabled())
  expect(api.canDmUser).toHaveBeenCalledTimes(2)
})

it('still opens the mobile modal immediately while details are loading', async () => {
  jest.mocked(useIsMobile).mockReturnValue(true)
  const details = deferred<Awaited<ReturnType<typeof api.getMutualServers>>>()
  jest.mocked(api.getMutualServers).mockReturnValue(details.promise)
  render(<ProfileCard user={otherUser} onClose={jest.fn()} anchorRect={new DOMRect(100, 500, 40, 20)} />)
  expect(screen.getByRole('dialog')).toBeVisible()
  await act(async () => details.resolve({ servers: [] }))
})

it('waits for desktop content when switching from the mobile layout', async () => {
  jest.mocked(useIsMobile).mockReturnValue(true)
  const onClose = jest.fn()
  const anchorRect = new DOMRect(100, 100, 40, 20)
  const { rerender } = render(<ProfileCard user={otherUser} onClose={onClose} anchorRect={anchorRect} />)
  await act(async () => {})
  const permissions = deferred<Awaited<ReturnType<typeof api.canDmUser>>>()
  jest.mocked(api.canDmUser).mockReturnValueOnce(permissions.promise)
  jest.mocked(useIsMobile).mockReturnValue(false)
  rerender(<ProfileCard user={otherUser} onClose={onClose} anchorRect={anchorRect} />)
  expect(screen.getByRole('dialog', { hidden: true })).not.toBeVisible()
  await act(async () => permissions.resolve({ allowed: true }))
  expect(screen.getByRole('dialog', { name: 'Bob' })).toBeVisible()
})
