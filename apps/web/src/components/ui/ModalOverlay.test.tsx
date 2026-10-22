import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModalOverlay } from './ModalOverlay'
import { useState } from 'react'
import { createPortal } from 'react-dom'

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

it('lets an owned popup receive focus and consume Escape before closing the dialog', async () => {
  const close = jest.fn()
  function Example() {
    const [open, setOpen] = useState(false)
    return (
      <ModalOverlay onClose={close} aria-label="Members">
        <button aria-expanded={open} aria-controls={open ? 'role-options' : undefined} onClick={() => setOpen(true)}>
          Roles
        </button>
        {open &&
          createPortal(
            <div
              id="role-options"
              role="listbox"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setOpen(false)
              }}
            >
              Reader
            </div>,
            document.body
          )}
      </ModalOverlay>
    )
  }
  render(<Example />)
  fireEvent.click(screen.getByRole('button', { name: 'Roles' }))
  const popup = screen.getByRole('listbox')
  popup.focus()
  expect(popup).toHaveFocus()
  fireEvent.keyDown(popup, { key: 'Escape' })
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(close).toHaveBeenCalledTimes(1)
})
