import { resolveTextCommand } from './composerCommands'

it('expands supported text commands and leaves unknown commands for their own handlers', () => {
  expect(resolveTextCommand('me', 'waves')).toBe('*waves*')
  expect(resolveTextCommand('spoiler', 'answer')).toBe('||answer||')
  expect(resolveTextCommand('spoiler', '')).toBeNull()
  expect(resolveTextCommand('nick', 'Alice')).toBeNull()
})
