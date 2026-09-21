import { useTranslationStore } from './translation.store'

jest.mock('@/lib/api', () => ({
  api: {
    getTranslationCapabilities: jest.fn().mockResolvedValue({
      enabled: true,
      languages: [
        { code: 'en', name: 'English', targets: ['cs', 'sk'] },
        { code: 'cs', name: 'Czech', targets: ['en', 'sk'] },
        { code: 'sk', name: 'Slovak', targets: ['en', 'cs'] }
      ]
    }),
    getTranslationPreference: jest.fn().mockResolvedValue({ targetLang: 'cs' }),
    setTranslationPreference: jest.fn().mockResolvedValue({ targetLang: 'cs' }),
    translateMessage: jest.fn().mockResolvedValue({ content: 'Dobrý den', targetLang: 'cs', detectedLang: 'en' })
  }
}))

import { api } from '@/lib/api'
const mockCapabilities = api.getTranslationCapabilities as jest.Mock
const mockPreference = api.getTranslationPreference as jest.Mock
const mockSetPreference = api.setTranslationPreference as jest.Mock
const mockTranslate = api.translateMessage as jest.Mock

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

describe('translation.store', () => {
  beforeEach(reset)

  it('fetches capabilities once and caches them', async () => {
    await useTranslationStore.getState().fetchCapabilities()
    await useTranslationStore.getState().fetchCapabilities()
    expect(mockCapabilities).toHaveBeenCalledTimes(1)
    expect(useTranslationStore.getState().capabilities?.enabled).toBe(true)
  })

  it('falls back to disabled on capabilities failure', async () => {
    mockCapabilities.mockRejectedValueOnce(new Error('offline'))
    await useTranslationStore.getState().fetchCapabilities()
    expect(useTranslationStore.getState().capabilities).toEqual({ enabled: false, languages: [] })
    expect(useTranslationStore.getState().capabilitiesLoaded).toBe(true)
  })

  it('loads the stored preference', async () => {
    await useTranslationStore.getState().loadPreference()
    expect(useTranslationStore.getState().targetLang).toBe('cs')
  })

  it('saves the preference and updates local state', async () => {
    mockSetPreference.mockResolvedValueOnce({ targetLang: 'sk' })
    await useTranslationStore.getState().savePreference('sk')
    expect(mockSetPreference).toHaveBeenCalledWith('sk')
    expect(useTranslationStore.getState().targetLang).toBe('sk')
  })

  it('translates and stores the result session-side', async () => {
    const err = await useTranslationStore.getState().translate('msg-1', 'cs')
    expect(err).toBeNull()
    expect(mockTranslate).toHaveBeenCalledWith('msg-1', 'cs')
    const tr = useTranslationStore.getState().translations['msg-1']
    expect(tr).toEqual({ content: 'Dobrý den', targetLang: 'cs', detectedLang: 'en', hidden: false })
  })

  it('dedupes concurrent translates for the same message+language', async () => {
    let resolveFirst!: (v: { content: string; targetLang: string; detectedLang: string | null }) => void
    mockTranslate.mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolveFirst = res
        })
    )
    const p1 = useTranslationStore.getState().translate('msg-1', 'cs')
    const p2 = useTranslationStore.getState().translate('msg-1', 'cs')
    resolveFirst({ content: 'x', targetLang: 'cs', detectedLang: 'en' })
    await Promise.all([p1, p2])
    expect(mockTranslate).toHaveBeenCalledTimes(1)
  })

  it('re-translates when the target language changes', async () => {
    await useTranslationStore.getState().translate('msg-1', 'cs')
    mockTranslate.mockResolvedValueOnce({ content: 'Dobrý deň', targetLang: 'sk', detectedLang: 'en' })
    await useTranslationStore.getState().translate('msg-1', 'sk')
    expect(mockTranslate).toHaveBeenCalledTimes(2)
    expect(useTranslationStore.getState().translations['msg-1'].targetLang).toBe('sk')
  })

  it('returns an error marker and clears pending on failure', async () => {
    mockTranslate.mockRejectedValueOnce(new Error('503'))
    const err = await useTranslationStore.getState().translate('msg-1', 'cs')
    expect(err).toBe('translationError')
    expect(useTranslationStore.getState().pending).toEqual({})
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
  })

  it('toggles hidden without dropping the stored text', async () => {
    await useTranslationStore.getState().translate('msg-1', 'cs')
    useTranslationStore.getState().toggleHidden('msg-1')
    expect(useTranslationStore.getState().translations['msg-1'].hidden).toBe(true)
    useTranslationStore.getState().toggleHidden('msg-1')
    expect(useTranslationStore.getState().translations['msg-1'].hidden).toBe(false)
  })
})
