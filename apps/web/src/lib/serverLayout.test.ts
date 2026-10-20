import { reconcileServerLayout, type ServerLayoutEntry } from '@chat/shared'
import { applyLayoutDrop, moveServer, removeFolder } from './serverLayout'

const root = (serverId: string): ServerLayoutEntry => ({ type: 'server', serverId })
const folder = (id: string, serverIds: string[]): ServerLayoutEntry => ({
  type: 'folder',
  id,
  name: id,
  collapsed: false,
  serverIds
})

it('preserves order, removes departed servers and appends new servers exactly once', () => {
  expect(reconcileServerLayout([root('b'), folder('games', ['c', 'gone']), root('b')], ['a', 'b', 'c', 'new'])).toEqual(
    [root('b'), folder('games', ['c']), root('a'), root('new')]
  )
})

it('moves servers into and out of folders without duplicates', () => {
  const original = [root('a'), folder('games', ['b', 'c']), root('d')]
  const inside = moveServer(original, 'a', 'games', 1)
  expect(inside).toEqual([folder('games', ['b', 'a', 'c']), root('d')])
  expect(moveServer(inside, 'a', null, 0)).toEqual(original)
  expect(original).toEqual([root('a'), folder('games', ['b', 'c']), root('d')])
  expect(() => moveServer(original, 'a', 'missing')).toThrow()
})

it('reorders root servers in both directions', () => {
  const original = [root('a'), root('b'), root('c')]
  expect(applyLayoutDrop(original, 'server:a', 'server:c', true)).toEqual([root('b'), root('c'), root('a')])
  expect(applyLayoutDrop(original, 'server:c', 'server:a')).toEqual([root('c'), root('a'), root('b')])
})

it('moves a server into collapsed folders and orders it among folder siblings', () => {
  const original = [root('a'), { ...folder('games', ['b', 'c']), collapsed: true }]
  expect(applyLayoutDrop(original, 'server:a', 'folder:games')).toEqual([
    { ...folder('games', ['b', 'c', 'a']), collapsed: true }
  ])
  expect(applyLayoutDrop(original, 'server:a', 'server:c')).toEqual([
    { ...folder('games', ['b', 'a', 'c']), collapsed: true }
  ])
})

it('moves between folders, back to root and reorders within one folder', () => {
  const original = [folder('one', ['a', 'b']), folder('two', ['c'])]
  expect(applyLayoutDrop(original, 'server:a', 'folder:two')).toEqual([folder('one', ['b']), folder('two', ['c', 'a'])])
  expect(applyLayoutDrop(original, 'server:a', 'root')).toEqual([folder('one', ['b']), folder('two', ['c']), root('a')])
  expect(applyLayoutDrop(original, 'server:a', 'server:b', true)).toEqual([
    folder('one', ['b', 'a']),
    folder('two', ['c'])
  ])
})

it('reorders entire folders without nesting or losing their contents', () => {
  const original = [root('a'), folder('games', ['b']), folder('work', ['c'])]
  expect(applyLayoutDrop(original, 'folder:work', 'server:a')).toEqual([
    folder('work', ['c']),
    root('a'),
    folder('games', ['b'])
  ])
  expect(applyLayoutDrop(original, 'folder:work', 'server:b')).toEqual([
    root('a'),
    folder('work', ['c']),
    folder('games', ['b'])
  ])
  expect(removeFolder(original, 'games')).toEqual([root('a'), root('b'), folder('work', ['c'])])
})

it('ignores self-drops and unknown drag targets', () => {
  const original = [root('a'), folder('games', ['b'])]
  expect(applyLayoutDrop(original, 'server:a', 'server:a')).toBe(original)
  expect(applyLayoutDrop(original, 'server:missing', 'root')).toBe(original)
  expect(applyLayoutDrop(original, 'folder:games', 'server:missing')).toBe(original)
})
