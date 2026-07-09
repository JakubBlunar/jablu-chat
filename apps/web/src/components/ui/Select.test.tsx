import '@testing-library/jest-dom'
import type { ChangeEvent } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Select } from './Select'

describe('Select', () => {
  it('renders the label and options', () => {
    render(
      <Select label="Channel" value="a" onChange={() => {}}>
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </Select>
    )

    expect(screen.getByText('Channel')).toBeInTheDocument()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('a')
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bravo' })).toBeInTheDocument()
  })

  it('fires onChange with the selected value', () => {
    let captured = ''
    const onChange = jest.fn((e: ChangeEvent<HTMLSelectElement>) => {
      captured = e.target.value
    })
    render(
      <Select defaultValue="a" onChange={onChange}>
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </Select>
    )

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalled()
    expect(captured).toBe('b')
  })
})
