import type { Room } from 'livekit-client'
import { focusForRoom } from './voiceTileFocus'

const participant = { kind: 'participant' as const, id: 'alex' }
const screen = { kind: 'screen' as const, id: 'screen:one' }

it('remembers participant focus across views and clears it when that participant leaves', () => {
  const room = {} as Room
  const focus = focusForRoom(room)
  focus.selected = participant.id
  expect(focusForRoom(room).update([participant, screen])).toBe(participant.id)
  expect(focus.update([screen])).toBeNull()
  expect(focusForRoom({} as Room).update([participant])).toBeNull()
})

it('keeps a dismissed share in grid view and focuses a newly published share', () => {
  const room = {} as Room
  const focus = focusForRoom(room)
  expect(focus.update([screen])).toBe(screen.id)
  focus.selected = null
  expect(focusForRoom(room).update([screen])).toBeNull()
  expect(focus.update([{ ...screen, id: 'screen:two' }])).toBe('screen:two')
})
