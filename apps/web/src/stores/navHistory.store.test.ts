import { useNavHistoryStore } from './navHistory.store'

function reset() {
  localStorage.clear()
  useNavHistoryStore.setState({
    userId: null,
    lastChannelByServer: {},
    serverOrder: [],
    lastDmScreen: null,
    lastLocation: null
  })
}

beforeEach(reset)

describe('navHistory store', () => {
  it('remembers the last channel per server', () => {
    const s = useNavHistoryStore.getState()
    s.recordChannel('srv-a', 'ch-general')
    s.recordChannel('srv-b', 'ch-random')

    expect(useNavHistoryStore.getState().getLastChannel('srv-a')).toBe('ch-general')
    expect(useNavHistoryStore.getState().getLastChannel('srv-b')).toBe('ch-random')
    expect(useNavHistoryStore.getState().getLastChannel('srv-c')).toBeNull()
  })

  it('overwrites the entry for a server rather than accumulating', () => {
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-1')
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-2')

    expect(useNavHistoryStore.getState().getLastChannel('srv-a')).toBe('ch-2')
    expect(useNavHistoryStore.getState().serverOrder).toEqual(['srv-a'])
  })

  it('evicts the least recently used server past the cap', () => {
    for (let i = 0; i < 55; i++) {
      useNavHistoryStore.getState().recordChannel(`srv-${i}`, `ch-${i}`)
    }

    const state = useNavHistoryStore.getState()
    expect(state.serverOrder).toHaveLength(50)
    expect(state.getLastChannel('srv-0')).toBeNull()
    expect(state.getLastChannel('srv-4')).toBeNull()
    expect(state.getLastChannel('srv-5')).toBe('ch-5')
    expect(state.getLastChannel('srv-54')).toBe('ch-54')
    expect(Object.keys(state.lastChannelByServer)).toHaveLength(50)
  })

  it('persists to localStorage under jablu-nav-history', () => {
    useNavHistoryStore.getState().syncUser('user-1')
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-general')
    useNavHistoryStore.getState().recordDmScreen('conv-1')

    const raw = localStorage.getItem('jablu-nav-history')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.state.userId).toBe('user-1')
    expect(parsed.state.lastChannelByServer['srv-a']).toBe('ch-general')
    expect(parsed.state.lastDmScreen).toBe('conv-1')
  })

  it('drops everything when a different user signs in', () => {
    useNavHistoryStore.getState().syncUser('user-1')
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-general')
    useNavHistoryStore.getState().recordDmScreen('conv-1')

    useNavHistoryStore.getState().syncUser('user-2')

    const state = useNavHistoryStore.getState()
    expect(state.userId).toBe('user-2')
    expect(state.getLastChannel('srv-a')).toBeNull()
    expect(state.lastDmScreen).toBeNull()
    expect(state.lastLocation).toBeNull()
  })

  it('keeps entries when the same user is synced again', () => {
    useNavHistoryStore.getState().syncUser('user-1')
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-general')

    useNavHistoryStore.getState().syncUser('user-1')

    expect(useNavHistoryStore.getState().getLastChannel('srv-a')).toBe('ch-general')
  })

  it('treats the friends list as a remembered DM screen', () => {
    useNavHistoryStore.getState().recordDmScreen('conv-1')
    useNavHistoryStore.getState().recordDmScreen(null)

    expect(useNavHistoryStore.getState().lastDmScreen).toBeNull()
    expect(useNavHistoryStore.getState().lastLocation).toEqual({ kind: 'dm', conversationId: null })
  })

  it('records the last location for both kinds', () => {
    useNavHistoryStore.getState().recordServerLocation('srv-a', 'ch-1')
    expect(useNavHistoryStore.getState().lastLocation).toEqual({
      kind: 'server',
      serverId: 'srv-a',
      channelId: 'ch-1'
    })

    useNavHistoryStore.getState().recordDmScreen('conv-9')
    expect(useNavHistoryStore.getState().lastLocation).toEqual({
      kind: 'dm',
      conversationId: 'conv-9'
    })
  })

  it('falls back to the remembered channel when the location has none', () => {
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-1')
    useNavHistoryStore.getState().recordServerLocation('srv-a', null)

    expect(useNavHistoryStore.getState().lastLocation).toEqual({
      kind: 'server',
      serverId: 'srv-a',
      channelId: 'ch-1'
    })
  })

  it('leaves the location channelless when the server has nothing remembered', () => {
    useNavHistoryStore.getState().recordServerLocation('srv-empty', null)

    expect(useNavHistoryStore.getState().lastLocation).toEqual({
      kind: 'server',
      serverId: 'srv-empty',
      channelId: null
    })
  })

  it('forgets a server on request', () => {
    useNavHistoryStore.getState().recordChannel('srv-a', 'ch-1')
    useNavHistoryStore.getState().forgetServer('srv-a')

    expect(useNavHistoryStore.getState().getLastChannel('srv-a')).toBeNull()
    expect(useNavHistoryStore.getState().serverOrder).toEqual([])
  })
})
