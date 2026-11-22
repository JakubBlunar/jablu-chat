import { VoiceStereoPositions } from './voiceStereoPositions'

beforeEach(() => localStorage.clear())

it('keeps distinct positions through joins, departures, and roster reordering in a large call', () => {
  const positions = new VoiceStereoPositions('listener')
  const ids = Array.from({ length: 40 }, (_, i) => String(i))
  positions.update(ids.slice(0, 1))
  expect(positions.get(ids[0])).toBeUndefined()
  positions.update(ids.slice(0, 4))
  const firstFour = ids.slice(0, 4).map((id) => positions.get(id))
  expect(firstFour).toEqual([-0.75, 0.75, -0.25, 0.25])
  positions.update(ids)
  const largeGroup = ids.map((id) => positions.get(id))
  expect(largeGroup.slice(0, 4)).toEqual(firstFour)
  expect(new Set(largeGroup).size).toBe(ids.length)
  expect(largeGroup.every((value) => value !== undefined && Math.abs(value) <= 0.75)).toBe(true)
  positions.update(ids.slice(1).reverse())
  expect(ids.slice(1).map((id) => positions.get(id))).toEqual(largeGroup.slice(1))
  positions.update([ids[1]])
  expect(positions.get(ids[1])).toBe(firstFour[1])
  positions.update(ids)
  expect(ids.map((id) => positions.get(id))).toEqual(largeGroup)
})

it('keeps a returning speaker’s usual spot free when guests join first in a later call', () => {
  const positions = new VoiceStereoPositions('listener')
  positions.update(['ann', 'bea'])
  const left = positions.get('ann')
  const right = positions.get('bea')
  const nextCall = new VoiceStereoPositions('listener')
  nextCall.update(['cam'])
  expect(nextCall.get('cam')).toBeUndefined()
  nextCall.update(['cam', 'bea'])
  const guest = nextCall.get('cam')
  nextCall.update(['cam', 'bea', 'ann'])
  expect(nextCall.get('bea')).toBe(right)
  expect(nextCall.get('cam')).toBe(guest)
  expect(nextCall.get('ann')).toBe(left)
  expect(new Set([left, right, guest]).size).toBe(3)

  const otherListener = new VoiceStereoPositions('another listener')
  otherListener.update(['bea', 'ann'])
  expect(otherListener.get('bea')).toBe(left)
})

it('bounds saved history while retaining recently heard regulars', () => {
  for (let i = 0; i < 150; i++) {
    new VoiceStereoPositions('listener').update(['regular', String(i)])
  }
  const entries: [string, number][] = JSON.parse(localStorage.getItem('jablu-voice-positions:listener')!)
  expect(entries).toHaveLength(128)
  expect(new Map(entries).get('regular')).toBe(-0.75)
  expect(new Map(entries).has('0')).toBe(false)
})

it('keeps voices separated when local history cannot be read or saved', () => {
  localStorage.setItem('jablu-voice-positions:listener', 'malformed')
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage unavailable')
  })
  try {
    const positions = new VoiceStereoPositions('listener')
    positions.update(['ann', 'bea'])
    expect(positions.get('ann')).toBe(-0.75)
    expect(positions.get('bea')).toBe(0.75)
  } finally {
    write.mockRestore()
  }
})
