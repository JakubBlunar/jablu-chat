import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from './CommandPalette'
import type { Command } from '@/lib/commands/registry'

const mockRun = jest.fn()
const mockCommands: Command[] = [
  { id: 'chat', label: 'General', section: 'navigation', run: ({ close }) => close() },
  {
    id: 'appearance',
    label: 'Appearance',
    section: 'settings',
    run: ({ close }) => {
      mockRun()
      close()
    }
  }
]
jest.mock('@/lib/commands/useBuiltInCommands', () => ({ useBuiltInCommands: () => mockCommands }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = jest.fn()
})

it('exposes a named modal combobox, announces selection and restores focus after a command', async () => {
  const close = jest.fn()
  const view = (open: boolean) => (
    <MemoryRouter>
      <button>Commands trigger</button>
      <CommandPalette open={open} onClose={close} />
    </MemoryRouter>
  )
  const { rerender } = render(view(false))
  const trigger = screen.getByRole('button', { name: 'Commands trigger' })
  trigger.focus()
  rerender(view(true))
  expect(screen.getByRole('dialog', { name: 'commandPalette' })).toBeInTheDocument()
  const input = screen.getByRole('combobox', { name: 'commandPalette' })
  await waitFor(() => expect(input).toHaveFocus())
  expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Appearance' }).id)
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  expect(mockRun).toHaveBeenCalledTimes(1)
  rerender(view(false))
  expect(trigger).toHaveFocus()
})
