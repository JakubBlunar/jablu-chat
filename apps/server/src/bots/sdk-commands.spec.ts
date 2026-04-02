import { CommandRegistry } from '@chat/sdk'

function mockRest() {
  return {
    sendMessage: jest.fn().mockResolvedValue({}),
    sendDmMessage: jest.fn().mockResolvedValue({}),
    editMessage: jest.fn().mockResolvedValue({}),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    syncCommands: jest.fn().mockResolvedValue(undefined),
  } as any
}

describe('CommandRegistry (SDK)', () => {
  let registry: CommandRegistry
  let rest: ReturnType<typeof mockRest>

  beforeEach(() => {
    rest = mockRest()
    registry = new CommandRegistry(rest)
  })

  describe('register / getDefinitions', () => {
    it('stores and returns definitions', () => {
      const defs = [
        { name: 'help', description: 'Show help' },
        { name: 'setup', description: 'Setup bot', requiredPermission: 'MANAGE_CHANNELS' }
      ]
      registry.register(defs)
      expect(registry.getDefinitions()).toEqual(defs)
    })

    it('returns empty array when no commands registered', () => {
      expect(registry.getDefinitions()).toEqual([])
    })
  })

  describe('handleIncoming', () => {
    it('calls the correct handler', async () => {
      const handler = jest.fn()
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'test',
        args: { key: 'value' },
        user: { id: 'u1', username: 'tester', displayName: 'Tester' }
      })

      expect(handler).toHaveBeenCalledTimes(1)
      const ctx = handler.mock.calls[0][0]
      expect(ctx.commandName).toBe('test')
      expect(ctx.args).toEqual({ key: 'value' })
      expect(ctx.serverId).toBe('s1')
      expect(ctx.isDm).toBe(false)
    })

    it('ignores unknown commands', async () => {
      const handler = jest.fn()
      registry.onCommand('known', handler)

      await registry.handleIncoming({
        channelId: 'c1',
        commandName: 'unknown',
        args: {},
        user: { id: 'u1', username: 'tester', displayName: null }
      })

      expect(handler).not.toHaveBeenCalled()
    })

    it('parses userPermissions as bigint', async () => {
      const handler = jest.fn()
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null },
        userPermissions: '65'
      })

      const ctx = handler.mock.calls[0][0]
      expect(ctx.userPermissions).toBe(65n)
    })

    it('defaults userPermissions to 0n when missing', async () => {
      const handler = jest.fn()
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null }
      })

      const ctx = handler.mock.calls[0][0]
      expect(ctx.userPermissions).toBe(0n)
    })

    it('defaults to 0n on malformed userPermissions', async () => {
      const handler = jest.fn()
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null },
        userPermissions: 'not-a-number'
      })

      const ctx = handler.mock.calls[0][0]
      expect(ctx.userPermissions).toBe(0n)
    })

    it('detects DM context correctly', async () => {
      const handler = jest.fn()
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        conversationId: 'conv-1',
        channelId: 'conv-1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null }
      })

      const ctx = handler.mock.calls[0][0]
      expect(ctx.isDm).toBe(true)
      expect(ctx.serverId).toBeNull()
      expect(ctx.conversationId).toBe('conv-1')
    })

    it('reply in server channel uses sendMessage', async () => {
      const handler = jest.fn(async (ctx: any) => {
        await ctx.reply('hello')
      })
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null }
      })

      expect(rest.sendMessage).toHaveBeenCalledWith('c1', 'hello')
      expect(rest.sendDmMessage).not.toHaveBeenCalled()
    })

    it('reply in DM uses sendDmMessage', async () => {
      const handler = jest.fn(async (ctx: any) => {
        await ctx.reply('hello')
      })
      registry.onCommand('test', handler)

      await registry.handleIncoming({
        conversationId: 'conv-1',
        channelId: 'conv-1',
        commandName: 'test',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null }
      })

      expect(rest.sendDmMessage).toHaveBeenCalledWith('conv-1', 'hello')
      expect(rest.sendMessage).not.toHaveBeenCalled()
    })

    it('command names are case-insensitive', async () => {
      const handler = jest.fn()
      registry.onCommand('Help', handler)

      await registry.handleIncoming({
        serverId: 's1',
        channelId: 'c1',
        commandName: 'help',
        args: {},
        user: { id: 'u1', username: 'u', displayName: null }
      })

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })
})
