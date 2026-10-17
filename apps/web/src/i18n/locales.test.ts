import { detectAppLocale } from './locales'

it.each([
  [['cs-CZ', 'en-US'], 'cs'],
  [['sk-SK', 'cs-CZ'], 'sk'],
  [['de-DE', 'cs-CZ', 'en'], 'cs'],
  [['en-GB', 'cs-CZ'], 'en'],
  [['CS_cz'], 'cs'],
  [['fr-FR'], 'en'],
  [[], 'en']
])('detects the first supported device language from %j', (languages, expected) => {
  expect(detectAppLocale(languages)).toBe(expected)
})

it('uses navigator preferences when no explicit list is supplied', () => {
  const getter = jest.spyOn(navigator, 'languages', 'get').mockReturnValue(['sk-SK', 'en'])
  expect(detectAppLocale()).toBe('sk')
  getter.mockRestore()
})
