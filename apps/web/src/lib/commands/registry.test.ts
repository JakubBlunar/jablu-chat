import {
  filterCommands,
  groupCommandsBySection,
  registerCommand,
  selectRegisteredCommands,
  useCommandRegistry,
  type Command
} from './registry'

function makeCmd(id: string, overrides: Partial<Command> = {}): Command {
  return {
    id,
    label: id,
    section: 'actions',
    run: () => {},
    ...overrides
  }
}

beforeEach(() => {
  useCommandRegistry.setState({ commands: new Map() })
})

describe('filterCommands', () => {
  it('returns all available commands when query is empty', () => {
    const cmds = [makeCmd('a'), makeCmd('b')]
    expect(filterCommands(cmds, '')).toEqual(cmds)
  })

  it('drops commands with available === false', () => {
    const cmds = [makeCmd('a'), makeCmd('b', { available: false })]
    expect(filterCommands(cmds, '').map((c) => c.id)).toEqual(['a'])
  })

  it('matches by label, hint, or keywords (case insensitive)', () => {
    const cmds = [
      makeCmd('new', { label: 'New channel', keywords: ['create'] }),
      makeCmd('mute', { label: 'Mute', hint: 'Silence alerts' }),
      makeCmd('other', { label: 'Something else' })
    ]
    expect(filterCommands(cmds, 'channel').map((c) => c.id)).toEqual(['new'])
    expect(filterCommands(cmds, 'CREATE').map((c) => c.id)).toEqual(['new'])
    expect(filterCommands(cmds, 'silence').map((c) => c.id)).toEqual(['mute'])
  })
})

describe('groupCommandsBySection', () => {
  it('groups commands in declared section order and preserves input order within sections', () => {
    const cmds = [
      makeCmd('s1', { section: 'settings' }),
      makeCmd('n1', { section: 'navigation' }),
      makeCmd('a1', { section: 'actions' }),
      makeCmd('n2', { section: 'navigation' })
    ]
    const grouped = groupCommandsBySection(cmds)
    expect(Array.from(grouped.keys())).toEqual([
      'navigation',
      'actions',
      'status',
      'settings',
      'mod',
      'help'
    ])
    expect(grouped.get('navigation')?.map((c) => c.id)).toEqual(['n1', 'n2'])
    expect(grouped.get('actions')?.map((c) => c.id)).toEqual(['a1'])
    expect(grouped.get('settings')?.map((c) => c.id)).toEqual(['s1'])
    expect(grouped.get('status')).toEqual([])
  })
})

describe('registerCommand', () => {
  it('adds a command to the store and returns an unregister function', () => {
    const cmd = makeCmd('global-action')
    const unregister = registerCommand(cmd)

    expect(selectRegisteredCommands(useCommandRegistry.getState()).map((c) => c.id)).toEqual([
      'global-action'
    ])

    unregister()
    expect(selectRegisteredCommands(useCommandRegistry.getState())).toEqual([])
  })

  it('replaces existing entries when registering the same id twice', () => {
    registerCommand(makeCmd('dup', { label: 'first' }))
    registerCommand(makeCmd('dup', { label: 'second' }))
    const [cmd] = selectRegisteredCommands(useCommandRegistry.getState())
    expect(cmd.label).toBe('second')
  })
})
