import { applyComposerCompletion, findComposerTrigger } from './composerCompletion'

const all = { mentions: true, channels: true, commands: true, emojis: true }

it('finds the closest enabled trigger and rejects email or multiline fragments', () => {
  expect(findComposerTrigger('Hi @al', 6, all)).toEqual({ mode: 'mention', query: 'al', start: 3 })
  expect(findComposerTrigger('mail@example.com', 16, all)).toBeNull()
  expect(findComposerTrigger('@old\nnew', 8, all)).toBeNull()
  expect(findComposerTrigger('/po', 3, { ...all, commands: false })).toBeNull()
  expect(findComposerTrigger('Hi :sm', 6, all)).toEqual({ mode: 'emoji', query: 'sm', start: 3 })
})

it('replaces only the active fragment and returns the caret after the inserted Unicode text', () => {
  expect(applyComposerCompletion('Hi @al, welcome', 3, 6, '@alice ')).toEqual({
    value: 'Hi @alice , welcome',
    cursor: 10
  })
  expect(applyComposerCompletion(':wave', 0, 5, '👋 ')).toEqual({ value: '👋 ', cursor: 3 })
})
