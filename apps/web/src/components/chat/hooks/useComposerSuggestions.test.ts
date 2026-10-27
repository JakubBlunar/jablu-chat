import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { useComposerSuggestions } from './useComposerSuggestions'

function setup(value: string) {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setSelectionRange(value.length, value.length)
  const props = {
    value,
    onChange: jest.fn(),
    taRef: { current: textarea },
    wrapperRef: { current: document.createElement('div') },
    members: [
      { userId: 'alice', username: 'alice', displayName: null, avatarUrl: null },
      { userId: '__role__:moderator', username: 'Room Mods', displayName: null, avatarUrl: null }
    ]
  }
  return { props, ...renderHook(() => useComposerSuggestions(props)) }
}

it('accepts a quoted role suggestion with keyboard navigation and cancels with Escape', () => {
  const { result, props } = setup('@Room')
  expect(result.current.filteredMembers.map((member) => member.username)).toEqual(['Room Mods'])
  const event = (key: string) => ({ key, preventDefault: jest.fn() }) as unknown as KeyboardEvent<HTMLTextAreaElement>
  act(() => {
    expect(result.current.handleSuggestionKeyDown(event('Enter'))).toBe(true)
  })
  expect(props.onChange).toHaveBeenCalledWith('@"Room Mods" ')
  expect(result.current.popupOpen).toBe(false)
  act(() => result.current.detectTrigger())
  act(() => result.current.handleSuggestionKeyDown(event('Escape')))
  expect(result.current.popupOpen).toBe(false)
})

it('dismisses on outside mouse down and removes the listener on unmount', () => {
  const remove = jest.spyOn(document, 'removeEventListener')
  const { result, unmount } = setup('@ali')
  expect(result.current.popupOpen).toBe(true)
  act(() => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
  expect(result.current.popupOpen).toBe(false)
  unmount()
  expect(remove).toHaveBeenCalledWith('mousedown', expect.any(Function))
  remove.mockRestore()
})

it('does not reopen a dismissed popup from a queued detection for unchanged text', () => {
  const { result, props } = setup('@ali')
  act(() => result.current.dismissSuggestions())
  act(() => result.current.detectTrigger())
  expect(result.current.popupOpen).toBe(false)
  props.taRef.current.value = '@alic'
  props.taRef.current.setSelectionRange(5, 5)
  act(() => result.current.detectTrigger())
  expect(result.current.popupOpen).toBe(true)
})
