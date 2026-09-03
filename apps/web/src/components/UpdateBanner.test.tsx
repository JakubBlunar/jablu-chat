import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { UpdateBanner } from './UpdateBanner'
import { useDesktopUpdateStore } from '@/stores/desktopUpdate.store'

const check = jest.fn()

jest.mock('@/lib/electron', () => ({
  electronAPI: {},
  isElectron: true
}))

describe('UpdateBanner (desktop)', () => {
  beforeEach(() => {
    check.mockReset()
    useDesktopUpdateStore.setState({
      state: { status: 'idle' },
      lastCheckedAt: null,
      checking: false,
      installing: false,
      check
    })
  })

  it('stays hidden while an update is ready (title bar owns that state)', () => {
    useDesktopUpdateStore.setState({ state: { status: 'ready', version: '1.2.0' } })
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a retryable error banner', () => {
    useDesktopUpdateStore.setState({
      state: { status: 'error', message: 'network failed' }
    })
    render(<UpdateBanner />)
    expect(screen.getByText(/Update failed: network failed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(check).toHaveBeenCalled()
  })

  it('explains a client that is too old for the server', () => {
    useDesktopUpdateStore.setState({
      state: {
        status: 'incompatible',
        reason: 'client-too-old',
        minClient: '1.1.0',
        maxClient: null
      }
    })
    render(<UpdateBanner />)
    expect(screen.getByText(/older than the server requires \(min 1.1.0\)/)).toBeInTheDocument()
  })
})
