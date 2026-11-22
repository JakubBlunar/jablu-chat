import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MobileSettingsShell } from './MobileSettingsShell'

it('retains the index, announces the detail and returns keyboard focus to the chosen entry', async () => {
  const close = jest.fn()
  function Settings() {
    const [tab, setTab] = useState('first')
    return (
      <MobileSettingsShell
        title="Settings"
        detailTitle={tab}
        tab={tab}
        closeLabel="Close"
        backLabel="Back"
        onClose={close}
        className=""
        index={(openDetail) => (
          <button
            data-settings-key="lower"
            onClick={() => {
              setTab('lower')
              openDetail()
            }}
          >
            Lower entry
          </button>
        )}
      >
        Detail
      </MobileSettingsShell>
    )
  }
  render(<Settings />)
  const entry = screen.getByRole('button', { name: 'Lower entry' })
  fireEvent.click(entry)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'lower' })).toBe(document.activeElement))
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(entry).toBe(document.activeElement))
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(close).toHaveBeenCalledTimes(1)
})
