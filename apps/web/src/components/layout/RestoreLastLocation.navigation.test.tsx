import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter, HashRouter, Route, Routes, useLocation } from 'react-router-dom'
import { RestoreLastLocation } from './RestoreLastLocation'
import { useNavHistoryStore, type NavLocation } from '@/stores/navHistory.store'

let mockUserId: string | null = 'user-1'
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: { getState: () => ({ user: mockUserId ? { id: mockUserId } : null }) }
}))

function LocationTarget() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

beforeEach(() => {
  mockUserId = 'user-1'
  localStorage.clear()
  useNavHistoryStore.setState({
    userId: null,
    lastChannelByServer: {},
    serverOrder: [],
    lastDmScreen: null,
    lastLocation: null
  })
  window.history.replaceState(null, '', '/')
})

describe.each([
  ['desktop', HashRouter],
  ['web', BrowserRouter]
] as const)('%s startup restoration', (_name, Router) => {
  function launch(path = '/') {
    window.history.replaceState(null, '', Router === HashRouter ? `/#${path}` : path)
    render(
      <Router>
        <Routes>
          <Route path="/" element={<RestoreLastLocation />} />
          <Route path="/channels/*" element={<LocationTarget />} />
        </Routes>
      </Router>
    )
  }

  it.each<{ location: NavLocation; expected: string }>([
    { location: { kind: 'server', serverId: 's1', channelId: 'ch1' }, expected: '/channels/s1/ch1' },
    { location: { kind: 'server', serverId: 's1', channelId: null }, expected: '/channels/s1' },
    { location: { kind: 'dm', conversationId: 'dm1' }, expected: '/channels/@me/dm1' },
    { location: { kind: 'dm', conversationId: null }, expected: '/channels/@me' }
  ])('restores persisted $expected on a fresh launch', async ({ location, expected }) => {
    localStorage.setItem('jablu-nav-history', JSON.stringify({
      version: 1,
      state: { userId: mockUserId, lastLocation: location }
    }))
    await useNavHistoryStore.persist.rehydrate()

    launch()

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(expected))
    expect(useNavHistoryStore.getState().lastLocation).toEqual(location)
  })

  it('opens home when there is no saved location', async () => {
    launch()
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/channels/@me'))
  })

  it('does not restore another account location', async () => {
    useNavHistoryStore.setState({
      userId: 'other-user',
      lastLocation: { kind: 'server', serverId: 'private-server', channelId: 'private-channel' }
    })
    launch()
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/channels/@me'))
    expect(useNavHistoryStore.getState().lastLocation).toBeNull()
  })

  it('leaves explicit message links intact instead of restoring the saved location', () => {
    useNavHistoryStore.setState({
      userId: mockUserId,
      lastLocation: { kind: 'server', serverId: 'old-server', channelId: 'old-channel' }
    })
    launch('/channels/new-server/new-channel?m=reply&thread=parent')
    expect(screen.getByTestId('location').textContent)
      .toBe('/channels/new-server/new-channel?m=reply&thread=parent')
  })
})
