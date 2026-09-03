import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { DesktopUpdateButton } from './DesktopUpdateButton'
import { useDesktopUpdateStore } from '@/stores/desktopUpdate.store'

const install = jest.fn()

jest.mock('@/lib/electron', () => ({
  electronAPI: {},
  isElectron: true
}))

describe('DesktopUpdateButton', () => {
  beforeEach(() => {
    install.mockReset()
    useDesktopUpdateStore.setState({
      state: { status: 'idle' },
      lastCheckedAt: null,
      checking: false,
      installing: false,
      install
    })
  })

  it('is hidden when no update is in flight', () => {
    const { container } = render(<DesktopUpdateButton />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a downloading indicator that is not clickable', () => {
    useDesktopUpdateStore.setState({
      state: { status: 'downloading', version: '1.2.0', percent: 50 }
    })
    render(<DesktopUpdateButton />)
    const button = screen.getByRole('button', { name: 'Downloading update' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(install).not.toHaveBeenCalled()
  })

  it('shows a ready control that installs on click', () => {
    useDesktopUpdateStore.setState({
      state: { status: 'ready', version: '1.2.0' }
    })
    render(<DesktopUpdateButton />)
    const button = screen.getByRole('button', { name: 'Restart to install version 1.2.0' })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(install).toHaveBeenCalled()
  })

  it('does not install twice while a restart is already in progress', () => {
    useDesktopUpdateStore.setState({
      state: { status: 'ready', version: '1.2.0' },
      installing: true
    })
    render(<DesktopUpdateButton />)
    const button = screen.getByRole('button', { name: 'Restart to install version 1.2.0' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(install).not.toHaveBeenCalled()
  })
})
