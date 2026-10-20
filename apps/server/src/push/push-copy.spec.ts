import {
  eventReminderPushCopy,
  friendRequestPushCopy,
  messagePushCopy,
  moderationPushCopy
} from './push-copy'

describe('localized push copy', () => {
  it('keeps message previews user-authored while translating attachment fallbacks', () => {
    const titles = { en: 'DM from Alex', cs: 'Soukromá zpráva od Alex', sk: 'Súkromná správa od Alex' }
    const userContent = messagePushCopy(titles, 'Hello in English')
    expect(userContent.en.body).toBe('Hello in English')
    expect(userContent.cs.body).toBe('Hello in English')
    expect(userContent.sk.body).toBe('Hello in English')

    const image = messagePushCopy(titles, undefined, [{ type: 'image' }])
    expect(image.en.body).toBe('sent an image')
    expect(image.cs.body).toBe('odeslal(a) obrázek')
    expect(image.sk.body).toBe('odoslal(a) obrázok')
  })

  it('translates friend, moderation, and event notification text', () => {
    expect(friendRequestPushCopy('Alex').cs.body).toContain('žádost o přátelství')
    expect(moderationPushCopy('ban', 'My server', 'spam').sk.body).toContain('spam')
    expect(eventReminderPushCopy('Game night').cs.body).toBe('Tato událost začíná za 30 minut!')
  })
})
