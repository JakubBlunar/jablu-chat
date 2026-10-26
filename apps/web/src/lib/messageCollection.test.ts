import { addMessageReaction, removeMessageReaction } from './messageCollection'
import { makeMessage } from '@/test/factories'

it('updates aggregate counts without treating a compact preview as the entire reactor list', () => {
  const message = makeMessage({ reactions: [{ emoji: '👍', count: 1000, userIds: ['self'], usersComplete: false, isCustom: false }] })
  const removed = removeMessageReaction([message], message.id, '👍', 'unloaded-user')
  expect(removed[0].reactions?.[0].count).toBe(999)
  expect(removed[0].reactions?.[0].userIds).toEqual(['self'])
  const added = addMessageReaction(removed, message.id, '👍', 'new-user')
  expect(added[0].reactions?.[0].count).toBe(1000)
  expect(addMessageReaction(added, message.id, '👍', 'new-user')).toBe(added)
})
