import { Permission } from '@chat/shared'
import { routeRestSlashCommand, routeDmSlashCommand } from './gateway-event-listeners'

function mockSocket(isBot = true) {
  return {
    emit: jest.fn(),
    data: { user: { id: 'bot-user-1', isBot } }
  }
}

function createMockGateway(overrides: Record<string, any> = {}) {
  const botSocket = mockSocket()
  return {
    prisma: {
      serverMember: { findMany: jest.fn().mockResolvedValue([]) },
      botApplication: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    roles: {
      getChannelPermissions: jest.fn().mockResolvedValue(
        Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL
      ),
    },
    server: {
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([botSocket]),
      }),
    },
    botSocket,
    ...overrides,
  } as any
}

describe('routeRestSlashCommand', () => {
  it('routes a valid command to bot socket', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: [{ name: 'setup', parameters: [], requiredPermission: null }]
    }])
    gw.prisma.user.findUnique.mockResolvedValue({
      id: 'author-1', username: 'tester', displayName: 'Tester'
    })

    await routeRestSlashCommand(gw, '/setup', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).toHaveBeenCalledWith('bot:command', expect.objectContaining({
      commandName: 'setup',
      serverId: 'server-1',
      channelId: 'channel-1'
    }))
  })

  it('enforces requiredPermission on invoker', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: [{ name: 'setup', parameters: [], requiredPermission: 'MANAGE_CHANNELS' }]
    }])
    gw.roles.getChannelPermissions
      .mockResolvedValueOnce(Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL) // invoker perms - no MANAGE_CHANNELS
      .mockResolvedValueOnce(Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL) // bot perms

    await routeRestSlashCommand(gw, '/setup', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('allows command when invoker has required permission', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: [{ name: 'setup', parameters: [], requiredPermission: 'MANAGE_CHANNELS' }]
    }])
    gw.prisma.user.findUnique.mockResolvedValue({
      id: 'author-1', username: 'admin', displayName: 'Admin'
    })
    gw.roles.getChannelPermissions.mockResolvedValue(
      Permission.SEND_MESSAGES | Permission.VIEW_CHANNEL | Permission.MANAGE_CHANNELS
    )

    await routeRestSlashCommand(gw, '/setup', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).toHaveBeenCalledWith('bot:command', expect.objectContaining({
      commandName: 'setup'
    }))
  })

  it('silently drops unknown requiredPermission values', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: [{ name: 'setup', parameters: [], requiredPermission: 'INVALID_PERM' }]
    }])

    await routeRestSlashCommand(gw, '/setup', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('does nothing when no bot members in server', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([])

    await routeRestSlashCommand(gw, '/help', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('does nothing when no matching command found', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: []
    }])

    await routeRestSlashCommand(gw, '/unknown', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('does nothing when bot lacks channel send permission', async () => {
    const gw = createMockGateway()
    gw.prisma.serverMember.findMany.mockResolvedValue([{ userId: 'bot-user-1' }])
    gw.prisma.botApplication.findMany.mockResolvedValue([{
      userId: 'bot-user-1',
      commands: [{ name: 'help', parameters: [], requiredPermission: null }]
    }])
    gw.roles.getChannelPermissions.mockResolvedValue(0n)

    await routeRestSlashCommand(gw, '/help', 'server-1', 'channel-1', 'author-1')
    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })
})

describe('routeDmSlashCommand', () => {
  it('routes DM command to bot socket', async () => {
    const gw = createMockGateway()
    gw.prisma.botApplication.findUnique.mockResolvedValue({
      userId: 'bot-user-1',
      commands: [{ name: 'help', parameters: [] }]
    })

    await routeDmSlashCommand(
      gw,
      '/help',
      'conv-1',
      'bot-user-1',
      { id: 'user-1', username: 'tester', displayName: 'Tester' }
    )

    expect(gw.botSocket.emit).toHaveBeenCalledWith('bot:command', expect.objectContaining({
      conversationId: 'conv-1',
      commandName: 'help',
      user: { id: 'user-1', username: 'tester', displayName: 'Tester' }
    }))
  })

  it('does nothing when bot has no matching command', async () => {
    const gw = createMockGateway()
    gw.prisma.botApplication.findUnique.mockResolvedValue({
      userId: 'bot-user-1',
      commands: []
    })

    await routeDmSlashCommand(
      gw,
      '/unknown',
      'conv-1',
      'bot-user-1',
      { id: 'user-1', username: 'tester', displayName: null }
    )

    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('does nothing when bot application not found', async () => {
    const gw = createMockGateway()
    gw.prisma.botApplication.findUnique.mockResolvedValue(null)

    await routeDmSlashCommand(
      gw,
      '/help',
      'conv-1',
      'bot-user-1',
      { id: 'user-1', username: 'tester', displayName: null }
    )

    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('does nothing when no bot socket is connected', async () => {
    const gw = createMockGateway()
    gw.prisma.botApplication.findUnique.mockResolvedValue({
      userId: 'bot-user-1',
      commands: [{ name: 'help', parameters: [] }]
    })
    gw.server.in.mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) })

    await routeDmSlashCommand(
      gw,
      '/help',
      'conv-1',
      'bot-user-1',
      { id: 'user-1', username: 'tester', displayName: null }
    )

    expect(gw.botSocket.emit).not.toHaveBeenCalled()
  })

  it('ignores non-bot sockets', async () => {
    const nonBotSocket = mockSocket(false)
    const gw = createMockGateway()
    gw.prisma.botApplication.findUnique.mockResolvedValue({
      userId: 'bot-user-1',
      commands: [{ name: 'help', parameters: [] }]
    })
    gw.server.in.mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue([nonBotSocket])
    })

    await routeDmSlashCommand(
      gw,
      '/help',
      'conv-1',
      'bot-user-1',
      { id: 'user-1', username: 'tester', displayName: null }
    )

    expect(nonBotSocket.emit).not.toHaveBeenCalled()
  })
})
