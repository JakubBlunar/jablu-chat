import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MultiSelect, type MultiSelectOption } from './MultiSelect'

beforeAll(() => {
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
  }
})

const options: MultiSelectOption[] = [
  { value: 'r1', label: 'Admin', color: '#ff0000' },
  { value: 'r2', label: 'Gamer', color: '#00ff00' },
  { value: 'r3', label: 'Member', color: null },
]

describe('MultiSelect', () => {
  it('shows the button label and a count badge for selected values', () => {
    render(<MultiSelect options={options} value={['r1', 'r2']} onChange={() => {}} buttonLabel="Roles" />)

    expect(screen.getByRole('button', { name: /Roles/ })).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('adds a value when an unselected option is chosen', () => {
    const onChange = jest.fn()
    render(<MultiSelect options={options} value={['r1']} onChange={onChange} buttonLabel="Roles" />)

    fireEvent.click(screen.getByRole('button', { name: /Roles/ }))
    fireEvent.click(screen.getByRole('option', { name: /Gamer/ }))

    expect(onChange).toHaveBeenCalledWith(['r1', 'r2'])
  })

  it('removes a value when a selected option is chosen again', () => {
    const onChange = jest.fn()
    render(<MultiSelect options={options} value={['r1', 'r2']} onChange={onChange} buttonLabel="Roles" />)

    fireEvent.click(screen.getByRole('button', { name: /Roles/ }))
    fireEvent.click(screen.getByRole('option', { name: /Admin/ }))

    expect(onChange).toHaveBeenCalledWith(['r2'])
  })
})
