import { fireEvent, render, screen } from '@testing-library/react'
import { PaginationControls } from './PaginationControls'

it('enforces page boundaries and prevents paging while a request is pending', () => {
  const previous = jest.fn(),
    next = jest.fn()
  const props = { page: 1, pages: 3, previousLabel: 'Previous', nextLabel: 'Next', onPrevious: previous, onNext: next }
  const { rerender } = render(<PaginationControls {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(previous).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
  rerender(<PaginationControls {...props} page={3} />)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(next).toHaveBeenCalledTimes(1)
  rerender(<PaginationControls {...props} page={2} disabled />)
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(previous).not.toHaveBeenCalled()
  expect(next).toHaveBeenCalledTimes(1)
})
