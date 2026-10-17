import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModalOverlay } from './ModalOverlay'

jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

it('names the dialog from its visible heading and preserves focus containment', async () => {
  const close = jest.fn()
  render(
    <>
      <button>Outside</button>
      <ModalOverlay onClose={close}>
        <h2>Create channel</h2>
        <input aria-label="Channel name" />
        <button>Save</button>
      </ModalOverlay>
    </>
  )
  const dialog = screen.getByRole('dialog', { name: 'Create channel' })
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveFocus())
  screen.getByRole('button', { name: 'Save' }).focus()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('textbox')).toHaveFocus()
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
})

it('supports explicit names and descriptions for dialogs without headings', () => {
  render(
    <ModalOverlay onClose={jest.fn()} aria-label="Delete message" aria-describedby="warning">
      <p id="warning">This cannot be undone.</p>
      <button>Cancel</button>
    </ModalOverlay>
  )
  expect(screen.getByRole('dialog', { name: 'Delete message' })).toHaveAccessibleDescription('This cannot be undone.')
})
