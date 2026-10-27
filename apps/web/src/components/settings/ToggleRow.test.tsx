import { fireEvent, render, screen } from '@testing-library/react'
import { ToggleRow } from './ToggleRow'

it('labels its switch, reports the next value and prevents disabled changes in either layout', () => {
  const change = jest.fn()
  const { rerender } = render(<ToggleRow label="Join muted" checked={false} onChange={change} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Join muted' }))
  expect(change).toHaveBeenCalledWith(true)
  rerender(<ToggleRow layout="inline" label="Join muted" checked={false} onChange={change} />)
  fireEvent.click(screen.getByText('Join muted'))
  expect(change).toHaveBeenCalledTimes(2)
  rerender(<ToggleRow layout="inline" label="Join muted" checked={false} onChange={change} disabled />)
  fireEvent.click(screen.getByRole('switch', { name: 'Join muted' }))
  fireEvent.click(screen.getByText('Join muted'))
  expect(change).toHaveBeenCalledTimes(2)
})
