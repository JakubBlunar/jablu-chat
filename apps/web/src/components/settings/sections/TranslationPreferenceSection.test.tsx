import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TranslationPreferenceSection } from './TranslationPreferenceSection'
import { useTranslationStore } from '@/stores/translation.store'
import { showToast } from '@/stores/toast.store'

jest.mock('@/stores/toast.store', () => ({ showToast: jest.fn() }))

jest.mock('@/lib/api', () => ({
  api: {
    getTranslationCapabilities: jest.fn(),
    getTranslationPreference: jest.fn().mockResolvedValue({ targetLang: null }),
    setTranslationPreference: jest.fn(),
    translateMessage: jest.fn()
  }
}))

import { api } from '@/lib/api'
const mockCapabilities = api.getTranslationCapabilities as jest.Mock
const mockGetPreference = api.getTranslationPreference as jest.Mock
const mockSetPreference = api.setTranslationPreference as jest.Mock

function reset() {
  jest.clearAllMocks()
  useTranslationStore.setState({
    capabilities: null,
    capabilitiesLoaded: false,
    capabilitiesError: false,
    preferenceLoaded: false,
    preferenceError: false,
    targetLang: null,
    pending: {},
    pendingSourceVersions: {},
    translations: {}
  })
}

const LANGS = [
  { code: 'en', name: 'English', targets: ['cs', 'sk'] },
  { code: 'cs', name: 'Czech', targets: ['en', 'sk'] },
  { code: 'sk', name: 'Slovak', targets: ['en', 'cs'] }
]

describe('TranslationPreferenceSection', () => {
  beforeEach(() => {
    reset()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('renders nothing when the capability is not enabled', async () => {
    useTranslationStore.setState({
      capabilities: { enabled: false, languages: [] },
      capabilitiesLoaded: true
    })
    const { container } = render(<TranslationPreferenceSection />)
    expect(container).toBeEmptyDOMElement()
    await waitFor(() => expect(useTranslationStore.getState().preferenceLoaded).toBe(true))
  })

  it('lists Auto plus every configured language and shows the stored preference', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    render(<TranslationPreferenceSection />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    const options = [...select.options].map((o) => o.textContent)
    expect(options).toEqual(['appearance.translateAuto', 'English', 'Czech', 'Slovak'])
    // No stored preference yet -> Auto selected.
    expect(select.value).toBe('')
  })

  it('saves the chosen language immediately', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    mockGetPreference.mockResolvedValueOnce({ targetLang: null })
    mockSetPreference.mockResolvedValueOnce({ targetLang: 'sk' })
    render(<TranslationPreferenceSection />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'sk' } })
    expect(mockSetPreference).toHaveBeenCalledWith('sk')
    await waitFor(() => expect(select.value).toBe('sk'))
    expect(useTranslationStore.getState().targetLang).toBe('sk')
  })

  it('sends null when switching back to Auto', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    mockGetPreference.mockResolvedValueOnce({ targetLang: 'cs' })
    mockSetPreference.mockResolvedValueOnce({ targetLang: null })
    render(<TranslationPreferenceSection />)
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement
    await waitFor(() => expect(select.value).toBe('cs'))
    fireEvent.change(select, { target: { value: '' } })
    expect(mockSetPreference).toHaveBeenCalledWith(null)
    await waitFor(() => expect(useTranslationStore.getState().targetLang).toBeNull())
  })

  it('dedupes setup across concurrently mounted sections', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    render(
      <>
        <TranslationPreferenceSection />
        <TranslationPreferenceSection />
      </>
    )
    await screen.findAllByRole('combobox')
    await waitFor(() => expect(useTranslationStore.getState().preferenceLoaded).toBe(true))
    expect(mockCapabilities).toHaveBeenCalledTimes(1)
    expect(mockGetPreference).toHaveBeenCalledTimes(1)
  })

  it('shows a retry action after capability setup fails and recovers on retry', async () => {
    mockCapabilities
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ enabled: true, languages: LANGS })
    render(<TranslationPreferenceSection />)
    expect(await screen.findByRole('alert')).toHaveTextContent('translationSetupFailed')
    fireEvent.click(screen.getByRole('button', { name: 'translationSetupRetry' }))
    expect(await screen.findByRole('combobox')).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockCapabilities).toHaveBeenCalledTimes(2)
    expect(mockGetPreference).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it('retries a failed preference load without refetching loaded capabilities', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    mockGetPreference.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ targetLang: 'sk' })
    render(<TranslationPreferenceSection />)
    await screen.findByRole('alert')
    expect(screen.getByRole('combobox')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'translationSetupRetry' }))
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('sk'))
    expect(screen.getByRole('combobox')).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockCapabilities).toHaveBeenCalledTimes(1)
    expect(mockGetPreference).toHaveBeenCalledTimes(2)
  })

  it('reports a failed save and keeps the previously saved selection', async () => {
    mockCapabilities.mockResolvedValueOnce({ enabled: true, languages: LANGS })
    mockGetPreference.mockResolvedValueOnce({ targetLang: 'cs' })
    mockSetPreference.mockRejectedValueOnce(new Error('offline'))
    render(<TranslationPreferenceSection />)
    const select = await screen.findByRole('combobox')
    await waitFor(() => expect(select).toHaveValue('cs'))
    fireEvent.change(select, { target: { value: 'sk' } })
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('appearance.translateErrorTitle', 'translationPreferenceFailed')
    )
    expect(select).toHaveValue('cs')
    expect(select).toBeEnabled()
  })
})
