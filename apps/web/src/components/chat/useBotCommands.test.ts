const mockGetServerBotCommands = jest.fn()
const mockGetBotUserCommands = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    getServerBotCommands: (...args: any[]) => mockGetServerBotCommands(...args),
    getBotUserCommands: (...args: any[]) => mockGetBotUserCommands(...args),
  },
}))

let socketHandlers: Record<string, ((...args: any[]) => void)[]> = {}
const mockSocketOn = jest.fn((event: string, handler: any) => {
  if (!socketHandlers[event]) socketHandlers[event] = []
  socketHandlers[event].push(handler)
})
const mockSocketOff = jest.fn()
jest.mock('@/lib/socket', () => ({
  getSocket: () => ({ on: mockSocketOn, off: mockSocketOff }),
}))

import { renderHook, act, waitFor } from '@testing-library/react'
import { useBotCommands } from './useBotCommands'
import type { BotCommandWithBot } from '@chat/shared'

const MOCK_COMMANDS: BotCommandWithBot[] = [
  {
    id: 'cmd-1',
    botAppId: 'app-1',
    name: 'help',
    description: 'Show help',
    parameters: [],
    requiredPermission: null,
    createdAt: new Date().toISOString(),
    bot: { id: 'app-1', name: 'TestBot', user: { id: 'bot-1', username: 'testbot', displayName: 'TestBot', avatarUrl: null } },
  },
]

describe('useBotCommands', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    socketHandlers = {}
    mockGetServerBotCommands.mockResolvedValue(MOCK_COMMANDS)
    mockGetBotUserCommands.mockResolvedValue(MOCK_COMMANDS)
  })

  it('returns empty when serverId is null', () => {
    const { result } = renderHook(() => useBotCommands(null, null, undefined))
    expect(result.current).toEqual([])
    expect(mockGetServerBotCommands).not.toHaveBeenCalled()
  })

  it('fetches when both serverId and channelId are set', async () => {
    const { result } = renderHook(() => useBotCommands('s1', 'c1', undefined))
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(mockGetServerBotCommands).toHaveBeenCalledWith('s1', 'c1')
  })

  it('fetches DM commands when botUserId is provided', async () => {
    const { result } = renderHook(() => useBotCommands(null, null, 'bot-1'))
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(mockGetBotUserCommands).toHaveBeenCalledWith('bot-1')
  })

  it('cache invalidation when channel changes', async () => {
    const { result, rerender } = renderHook(
      ({ serverId, channelId }) => useBotCommands(serverId, channelId, undefined),
      { initialProps: { serverId: 's1', channelId: 'c1' } }
    )

    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(mockGetServerBotCommands).toHaveBeenCalledTimes(1)

    const newCommands: BotCommandWithBot[] = [
      { ...MOCK_COMMANDS[0], id: 'cmd-2', name: 'setup' },
    ]
    mockGetServerBotCommands.mockResolvedValue(newCommands)

    rerender({ serverId: 's1', channelId: 'c2' })
    await waitFor(() => expect(mockGetServerBotCommands).toHaveBeenCalledTimes(2))
    expect(mockGetServerBotCommands).toHaveBeenLastCalledWith('s1', 'c2')
  })

  it('bot:commands-updated triggers refetch for matching serverId', async () => {
    const { result } = renderHook(() => useBotCommands('s1', 'c1', undefined))
    await waitFor(() => expect(result.current).toHaveLength(1))

    expect(mockGetServerBotCommands).toHaveBeenCalledTimes(1)

    const handler = socketHandlers['bot:commands-updated']?.[0]
    expect(handler).toBeDefined()

    await act(async () => handler!({ serverId: 's1' }))
    await waitFor(() => expect(mockGetServerBotCommands).toHaveBeenCalledTimes(2))
  })

  it('bot:commands-updated ignores different serverId', async () => {
    const { result } = renderHook(() => useBotCommands('s1', 'c1', undefined))
    await waitFor(() => expect(result.current).toHaveLength(1))

    const handler = socketHandlers['bot:commands-updated']?.[0]
    expect(handler).toBeDefined()

    await act(async () => handler!({ serverId: 's-other' }))
    expect(mockGetServerBotCommands).toHaveBeenCalledTimes(1)
  })

  it('returns empty on fetch error', async () => {
    mockGetServerBotCommands.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useBotCommands('s1', 'c1', undefined))
    await waitFor(() => expect(mockGetServerBotCommands).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})
