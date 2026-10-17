import '@testing-library/jest-dom'
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TranslateModal } from './TranslateModal'
import { useTranslationStore } from '@/stores/translation.store'
import { api } from '@/lib/api'
import { showToast } from '@/stores/toast.store'

jest.mock('@/lib/api', () => ({
  api: {
    getTranslationCapabilities: jest.fn(),
    getTranslationPreference: jest.fn(),
    setTranslationPreference: jest.fn(),
    translateMessage: jest.fn()
  }
}))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))
jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))

const LANGUAGES = [
  { code: 'en', name: 'English', targets: ['cs'] },
  { code: 'cs', name: 'Czech', targets: ['en'] }
]
const mockTranslate = api.translateMessage as jest.Mock
const mockSave = api.setTranslationPreference as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useTranslationStore.setState({
    ...useTranslationStore.getInitialState(),
    capabilities: { enabled: true, languages: LANGUAGES },
    capabilitiesLoaded: true
  })
  mockTranslate.mockResolvedValue({ content: 'translated', targetLang: 'en', detectedLang: 'cs' })
  mockSave.mockImplementation(async (targetLang: string | null) => ({ targetLang }))
})
afterEach(() => jest.restoreAllMocks())

describe('TranslateModal', () => {
  it('shows and allows choosing the default UI language instead of hiding it', async () => {
    const onClose = jest.fn()
    render(<TranslateModal messageId="m1" sourceVersion="revision-1" onClose={onClose} />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    const english = screen.getByRole('radio', { name: 'English' })
    expect(english).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(english)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockSave).toHaveBeenCalledWith('en')
    expect(mockTranslate).toHaveBeenCalledWith('m1', 'en')
    expect(useTranslationStore.getState().translations.m1.sourceVersion).toBe('revision-1')
  })

  it('allows choosing the only configured language', async () => {
    useTranslationStore.setState({ capabilities: { enabled: true, languages: LANGUAGES.slice(0, 1) } })
    const onClose = jest.fn()
    render(<TranslateModal messageId="m1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('preselects the explicit target without changing the saved default unless requested', async () => {
    useTranslationStore.setState({ targetLang: 'en', preferenceLoaded: true })
    const onClose = jest.fn()
    render(<TranslateModal messageId="m1" initialTarget="cs" onClose={onClose} />)
    const czech = screen.getByRole('radio', { name: 'Czech' })
    expect(czech).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(czech)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockTranslate).toHaveBeenCalledWith('m1', 'cs')
  })

  it('falls back to a configured target when explicit and saved targets are unsupported', () => {
    useTranslationStore.setState({ targetLang: 'sk' })
    render(<TranslateModal messageId="m1" initialTarget="de" onClose={jest.fn()} />)
    expect(screen.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
  })

  it('can translate without saving a default', async () => {
    render(<TranslateModal messageId="m1" onClose={jest.fn()} />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    await waitFor(() => expect(mockTranslate).toHaveBeenCalledWith('m1', 'en'))
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('reports preference-save failure but still translates the chosen revision', async () => {
    mockSave.mockRejectedValueOnce(new Error('offline'))
    const onClose = jest.fn()
    render(<TranslateModal messageId="m1" sourceVersion="edited" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(showToast).toHaveBeenCalledWith('translateErrorTitle', 'translationPreferenceFailed')
    expect(console.error).toHaveBeenCalled()
    expect(mockTranslate).toHaveBeenCalledWith('m1', 'en')
    expect(useTranslationStore.getState().translations.m1.sourceVersion).toBe('edited')
  })

  it('keeps the chosen target available and allows retry after translation failure', async () => {
    mockTranslate.mockRejectedValueOnce(new Error('offline'))
    const onClose = jest.fn()
    render(<TranslateModal messageId="m1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Czech' }))
    const czech = await screen.findByRole('radio', { name: 'Czech' })
    expect(czech).toHaveAttribute('aria-checked', 'true')
    expect(onClose).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith('translateErrorTitle', 'translateErrorMessage')
    fireEvent.click(czech)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockTranslate).toHaveBeenCalledTimes(2)
  })

  it.each(['success', 'failure'])('does not translate after unmount during preference-save %s', async (outcome) => {
    let resolve!: (value: { targetLang: string }) => void
    let reject!: (error: Error) => void
    const pending = new Promise<{ targetLang: string }>((res, rej) => {
      resolve = res
      reject = rej
    })
    mockSave.mockReturnValueOnce(pending)
    const onClose = jest.fn()
    const { unmount } = render(
      <StrictMode>
        <TranslateModal messageId="m1" sourceVersion="original" onClose={onClose} />
      </StrictMode>
    )
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    expect(mockSave).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => {
      if (outcome === 'success') resolve({ targetLang: 'en' })
      else reject(new Error('offline'))
      await pending.catch(() => {})
    })
    expect(mockTranslate).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each(['success', 'failure'])('does not notify or close after unmount during translation %s', async (outcome) => {
    let resolve!: (value: { content: string; targetLang: string; detectedLang: string }) => void
    let reject!: (error: Error) => void
    const pending = new Promise<{ content: string; targetLang: string; detectedLang: string }>((res, rej) => {
      resolve = res
      reject = rej
    })
    useTranslationStore.setState({ targetLang: 'en', preferenceLoaded: true })
    mockTranslate.mockReturnValueOnce(pending)
    const onClose = jest.fn()
    const { unmount } = render(<TranslateModal messageId="m1" onClose={onClose} />)
    fireEvent.click(screen.getByRole('radio', { name: 'English' }))
    expect(mockTranslate).toHaveBeenCalledTimes(1)
    unmount()
    await act(async () => {
      if (outcome === 'success') resolve({ content: 'translated', targetLang: 'en', detectedLang: 'cs' })
      else reject(new Error('offline'))
      await pending.catch(() => {})
    })
    expect(showToast).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
