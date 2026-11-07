import { replaceMemberMentions, resolveMentionIdentity, mentionText } from '@chat/shared'
import { processMentions } from './markdownMentions'

const reno = { username: 'jt', displayName: 'Reno', globalDisplayName: 'Global Reno' }
const hyphen = { username: 'de-Entropie', displayName: 'Dee' }
it('resolves server names case-insensitively and saves the account identity', () => {
  expect(replaceMemberMentions('Hi @reno and @JT!', [reno])).toBe('Hi @jt and @jt!')
  expect(resolveMentionIdentity('RENO', [reno])).toBe(reno)
  expect(processMentions('@reno @jt', new Map([['jt', { user: reno }]]))).toBe(
    '[@Reno](mention:jt) [@Reno](mention:jt)'
  )
})
it('supports quoted nicknames and full hyphenated handles without matching email addresses', () => {
  expect(mentionText('Žltý Reno')).toBe('@"Žltý Reno"')
  expect(replaceMemberMentions('@"Global Reno" and @de-Entropie, mail@jt.test', [reno, hyphen])).toBe(
    '@jt and @de-Entropie, mail@jt.test'
  )
  expect(processMentions('@de-Entropie', new Map([['de-entropie', { user: hyphen }]]))).toBe(
    '[@Dee](mention:de-Entropie)'
  )
})
it('prefers account handles and refuses ambiguous nicknames', () => {
  const namesake = { username: 'reno', displayName: 'Somebody else' }
  expect(resolveMentionIdentity('reno', [reno, namesake])).toBe(namesake)
  expect(resolveMentionIdentity('Reno', [reno, { username: 'other', displayName: 'Reno' }])).toBeUndefined()
  expect(replaceMemberMentions('@Reno', [reno, { username: 'other', displayName: 'Reno' }])).toBe('@Reno')
})
it('keeps persisted mentions attached when the server nickname changes again', () => {
  const content = replaceMemberMentions('@Reno hello', [reno])
  const renamed = { ...reno, displayName: 'Another name' }
  expect(processMentions(content, new Map([['jt', { user: renamed }]]))).toBe('[@Another name](mention:jt) hello')
})
