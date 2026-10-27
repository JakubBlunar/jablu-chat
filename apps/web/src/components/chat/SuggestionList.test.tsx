import { fireEvent, render, screen } from '@testing-library/react'
import { SuggestionList } from './SuggestionList'

it('keeps composer focus, selects once per pointer action, and supports keyboard activation', () => {
  HTMLElement.prototype.scrollIntoView = jest.fn()
  const select = jest.fn()
  const items = [
    { id: 'one', name: 'Alice' },
    { id: 'two', name: 'Bob' }
  ]
  const { rerender } = render(
    <SuggestionList
      items={items}
      getKey={(item) => item.id}
      label="Members"
      selectedIndex={0}
      onSelect={select}
      renderItem={(item) => item.name}
    />
  )
  const option = screen.getByRole('option', { name: 'Bob' })
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  fireEvent(option, event)
  expect(event.defaultPrevented).toBe(true)
  fireEvent.click(option, { detail: 1 })
  expect(select).toHaveBeenCalledTimes(1)
  expect(select).toHaveBeenCalledWith(items[1])
  fireEvent.click(option, { detail: 0 })
  expect(select).toHaveBeenCalledTimes(2)
  rerender(
    <SuggestionList
      items={items}
      getKey={(item) => item.id}
      label="Members"
      selectedIndex={1}
      onSelect={select}
      renderItem={(item) => item.name}
    />
  )
  expect(option.getAttribute('aria-selected')).toBe('true')
  expect(option.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
})
