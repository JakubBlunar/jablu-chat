import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TranslationPreferenceSection } from './TranslationPreferenceSection'
import { useTranslationStore } from '@/stores/translation.store'

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
    targetLang: null,
    pending: {},
    translations: {}
  })
}

const LANGS = [
  { code: 'en', name: 'English', targets: ['cs', 'sk'] },
  { code: 'cs', name: 'Czech', targets: ['en', 'sk'] },
  { code: 'sk', name: 'Slovak', targets: ['en', 'cs'] }
]

describe('TranslationPreferenceSection', () => {
  beforeEach(reset)

  it('renders nothing when the capability is not enabled', () => {
    useTranslationStore.setState({
      capabilities: { enabled: false, languages: [] },
      capabilitiesLoaded: true
    })
    const { container } = render(<TranslationPreferenceSection />)
    expect(container).toBeEmptyDOMElement()
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
})
