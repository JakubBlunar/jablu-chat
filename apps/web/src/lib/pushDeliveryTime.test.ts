import { minutesToTimeValue, timeValueToMinutes } from './pushDeliveryTime'

it('formats quiet hours and bounds invalid or excessive input', () => {
  expect(minutesToTimeValue(22 * 60 + 15)).toBe('22:15')
  expect(timeValueToMinutes('08:30')).toBe(510)
  expect(timeValueToMinutes('invalid')).toBe(0)
  expect(timeValueToMinutes('99:99')).toBe(1439)
})
