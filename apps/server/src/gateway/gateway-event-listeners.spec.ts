import type { ChatGateway } from './gateway.gateway'
import { registerEventListeners } from './gateway-event-listeners'

describe('welcome messages', () => {
  function setup(
    welcomeChannelId: string | null = 'welcome-channel',
    welcomeMessage: string | null = 'Welcome {user} to {server}!'
  ) {
    const handlers = new Map<string, (payload: unknown) => Promise<void>>()
    const message = {
      id: 'welcome-message',
      authorId: null,
      author: null,
      webhookId: null,
      webhookName: 'Test Server',
      webhookAvatarUrl: '/server-icon.png',
      reactions: []
    }
    const gateway = {
      refreshAllActivities: jest.fn().mockResolvedValue(undefined),
      refreshActivity: jest.fn().mockResolvedValue(undefined),
      refreshActivityForServer: jest.fn().mockResolvedValue(undefined),
      events: {
        on: jest.fn((event: string, handler: (payload: unknown) => Promise<void>) => {
          handlers.set(event, handler)
        })
      },
      server: {
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        in: jest.fn().mockReturnValue({ fetchSockets: jest.fn().mockResolvedValue([]) })
      },
      getVisibleChannelIds: jest.fn().mockResolvedValue(['welcome-channel']),
      prisma: {
        server: {
          findUnique: jest.fn().mockResolvedValue({
            name: 'Test Server',
            iconUrl: '/server-icon.png',
            welcomeChannelId,
            welcomeMessage
          })
        },
        message: { create: jest.fn().mockResolvedValue(message) }
      },
      emitToChannel: jest.fn()
    }
    registerEventListeners(gateway as unknown as ChatGateway)
    return { gateway, message, handlers, onJoin: handlers.get('member:joined')! }
  }

  it('reconciles privacy changes and notifies all of the sharing user\'s devices', async () => {
    const { gateway, handlers } = setup()
    await handlers.get('activity:preferences-changed')!({ userId: 'player' })
    expect(gateway.refreshActivity).toHaveBeenCalledWith('player')
    expect(gateway.server.to).toHaveBeenCalledWith('user:player')
    await handlers.get('activity:server-scope-changed')!({ userId: 'player', serverId: 'hidden-server' })
    expect(gateway.refreshActivityForServer).toHaveBeenCalledWith('player', 'hidden-server')
  })

  it('persists a server sender identity for live delivery and message history', async () => {
    const { gateway, message, onJoin } = setup()

    await onJoin({
      serverId: 'server-1',
      member: { userId: 'new-user', user: { username: 'newbie', displayName: 'New Member' } }
    })

    expect(gateway.prisma.server.findUnique).toHaveBeenCalledWith({
      where: { id: 'server-1' },
      select: { name: true, iconUrl: true, welcomeChannelId: true, welcomeMessage: true }
    })
    expect(gateway.prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          channelId: 'welcome-channel',
          content: 'Welcome New Member to Test Server!',
          webhookName: 'Test Server',
          webhookAvatarUrl: '/server-icon.png'
        }
      })
    )
    expect(gateway.emitToChannel).toHaveBeenCalledWith(
      'welcome-channel',
      'message:new',
      expect.objectContaining({
        id: message.id,
        author: null,
        webhookId: null,
        webhook: { name: 'Test Server', avatarUrl: '/server-icon.png' },
        reactions: []
      })
    )
  })

  it.each([
    [null, 'Welcome!'],
    ['welcome-channel', null]
  ])('does not post when welcome messages are disabled (%s, %s)', async (channelId, content) => {
    const { gateway, onJoin } = setup(channelId, content)

    await onJoin({ serverId: 'server-1', member: { userId: 'new-user' } })

    expect(gateway.prisma.message.create).not.toHaveBeenCalled()
    expect(gateway.emitToChannel).not.toHaveBeenCalled()
  })
})
