/** Architectural regression checks run with the ordinary web test command. */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import ts from 'typescript'

const root = resolve(process.cwd(), 'src')
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'test' ? [] : sources(path)
    return /\.tsx?$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name) ? [path] : []
  })
}
const selectionOwners: Record<string, string[]> = {
  setCurrentChannel: ['stores/channel.store.ts', 'stores/navigation.store.ts'],
  setCurrentConversation: ['stores/dm.store.ts', 'stores/navigation.store.ts'],
  setCurrentServer: ['stores/server.store.ts', 'stores/navigation.store.ts'],
  setViewMode: ['stores/server.store.ts', 'stores/navigation.store.ts'],
  openThread: ['stores/thread.store.ts', 'stores/navigation.store.ts'],
  openPost: ['stores/forum.store.ts', 'stores/navigation.store.ts'],
  registerConversationCoordinator: ['lib/conversationNavigation.ts', 'stores/navigation.store.ts'],
  bindConversationRouter: ['lib/conversationNavigation.ts', 'lib/notificationNavigation.ts'],
  enterRoute: ['stores/navigation.store.ts', 'hooks/useRouteSync.ts'],
  bindRouter: ['stores/navigation.store.ts', 'lib/conversationNavigation.ts'],
  navigateToChannel: [],
  navigateToDm: [],
  orchestratedGoToChannel: [],
  orchestratedGoToDm: []
}
const historyOwners = new Set([
  'stores/navigation.store.ts',
  'stores/message.store.ts',
  'stores/dm.store.ts',
  'stores/thread.store.ts',
  'stores/forumReply.store.ts',
  // Recovery catches up an already selected context, without changing selection.
  'hooks/useSocket.ts',
  'hooks/useChannelSocketSync.ts',
  // Adapters bridge generic pagination to per-surface stores.
  'hooks/useMessageStoreAdapter.ts',
  'hooks/useThreadSurfaceAdapter.ts',
  'hooks/useForumSurfaceAdapter.ts'
])
function violations(name: string, text: string): string[] {
  const file = ts.createSourceFile(
    name,
    text,
    ts.ScriptTarget.Latest,
    true,
    name.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const failures: string[] = []
  function flag(node: ts.Node, reason: string) {
    failures.push(`${name}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${reason}`)
  }
  function visit(node: ts.Node) {
    if (
      ts.isIdentifier(node) &&
      Object.hasOwn(selectionOwners, node.text) &&
      !selectionOwners[node.text].includes(name)
    )
      flag(node, `selection/route action ${node.text} belongs to its owner`)
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const action = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : ''
      if (['fetchMessages', 'fetchMessagesAround'].includes(action) && !historyOwners.has(name)) {
        const isOlderPage =
          name === 'components/chat/hooks/useMessageScroll.ts' &&
          action === 'fetchMessages' &&
          node.arguments.length === 2
        if (!isOlderPage) flag(node, 'initial history loading belongs to the conversation coordinator')
      }
      if (action === 'navigate' || action === 'routerNavigate') {
        const destination = node.arguments[0]
        if (destination && ts.isStringLiteralLike(destination) && destination.text.startsWith('/channels/'))
          flag(node, 'conversation navigation must use openConversation')
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'setState' &&
        node.arguments[0] &&
        ts.isObjectLiteralExpression(node.arguments[0]) &&
        name !== 'stores/sessionCleanup.ts'
      ) {
        for (const property of node.arguments[0].properties) {
          if (
            property.name &&
            ['currentServerId', 'currentChannelId', 'currentConversationId', 'viewMode'].includes(
              property.name.getText(file)
            )
          )
            flag(property, 'route selection cannot be assigned with setState')
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return failures
}
it('keeps one selection owner and prevents feature-level initial loaders', () => {
  const failures = sources(root).flatMap((path) =>
    violations(relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8'))
  )
  expect(failures).toEqual([])
})
it('rejects destructured selection setters, raw routes and duplicate initial loaders', () => {
  expect(
    violations(
      'components/FutureFeature.tsx',
      `
    const { setCurrentChannel } = useChannelStore.getState()
    setCurrentChannel('other')
    useDmStore.setState({ currentConversationId: 'other' })
    navigate('/channels/s1/ch1')
    store.fetchMessages('ch1')
    useThreadStore.getState().openThread('ch1', parent)
  `
    ).length
  ).toBeGreaterThanOrEqual(5)
})
it('allows pagination without allowing a second initial load in the scroll hook', () => {
  expect(violations('components/chat/hooks/useMessageScroll.ts', 'fetchMessages(id, cursor)')).toEqual([])
  expect(violations('components/chat/hooks/useMessageScroll.ts', 'fetchMessages(id)')).toHaveLength(1)
})
