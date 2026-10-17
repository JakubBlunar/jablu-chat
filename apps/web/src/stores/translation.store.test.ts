import { useTranslationStore } from './translation.store'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import type { TranslationCapabilities, TranslationResult } from '@/lib/api'

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
  useTranslationStore.getState().reset()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('translation.store', () => {
  beforeEach(() => {
    reset()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('fetches capabilities once and caches them', async () => {
    await useTranslationStore.getState().fetchCapabilities()
    await useTranslationStore.getState().fetchCapabilities()
    expect(mockCapabilities).toHaveBeenCalledTimes(1)
    expect(useTranslationStore.getState().capabilities?.enabled).toBe(true)
  })

  it('shares in-flight capabilities requests', async () => {
    const request = deferred<TranslationCapabilities>()
    mockCapabilities.mockReturnValueOnce(request.promise)
    const first = useTranslationStore.getState().fetchCapabilities()
    const second = useTranslationStore.getState().fetchCapabilities()
    expect(first).toBe(second)
    expect(mockCapabilities).toHaveBeenCalledTimes(1)
    request.resolve({ enabled: true, languages: [] })
    await Promise.all([first, second])
    expect(useTranslationStore.getState().capabilitiesLoaded).toBe(true)
  })

  it('exposes and logs capability failures without caching disabled, and allows retry', async () => {
    mockCapabilities.mockRejectedValueOnce(new Error('offline'))
    await useTranslationStore.getState().fetchCapabilities()
    expect(useTranslationStore.getState().capabilities).toBeNull()
    expect(useTranslationStore.getState().capabilitiesLoaded).toBe(false)
    expect(useTranslationStore.getState().capabilitiesError).toBe(true)
    expect(console.error).toHaveBeenCalledWith('Failed to load translation capabilities', expect.any(Error))
    await useTranslationStore.getState().fetchCapabilities()
    expect(mockCapabilities).toHaveBeenCalledTimes(2)
    expect(useTranslationStore.getState().capabilitiesLoaded).toBe(true)
    expect(useTranslationStore.getState().capabilitiesError).toBe(false)
  })

  it('loads the stored preference', async () => {
    await useTranslationStore.getState().loadPreference()
    expect(useTranslationStore.getState().targetLang).toBe('cs')
    expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
  })

  it('shares in-flight preferences and loads a successful preference only once', async () => {
    const request = deferred<{ targetLang: string | null }>()
    mockPreference.mockReturnValueOnce(request.promise)
    const first = useTranslationStore.getState().loadPreference()
    const second = useTranslationStore.getState().loadPreference()
    expect(first).toBe(second)
    expect(mockPreference).toHaveBeenCalledTimes(1)
    request.resolve({ targetLang: null })
    await Promise.all([first, second])
    await useTranslationStore.getState().loadPreference()
    expect(mockPreference).toHaveBeenCalledTimes(1)
    expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
  })

  it('exposes and logs preference failures and retries instead of caching them', async () => {
    mockPreference.mockRejectedValueOnce(new Error('offline'))
    await useTranslationStore.getState().loadPreference()
    expect(useTranslationStore.getState().preferenceError).toBe(true)
    expect(useTranslationStore.getState().preferenceLoaded).toBe(false)
    expect(console.error).toHaveBeenCalledWith('Failed to load translation preference', expect.any(Error))
    await useTranslationStore.getState().loadPreference()
    expect(mockPreference).toHaveBeenCalledTimes(2)
    expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
    expect(useTranslationStore.getState().preferenceError).toBe(false)
  })

  it('saves the preference and updates local state', async () => {
    mockSetPreference.mockResolvedValueOnce({ targetLang: 'sk' })
    await useTranslationStore.getState().savePreference('sk')
    expect(mockSetPreference).toHaveBeenCalledWith('sk')
    expect(useTranslationStore.getState().targetLang).toBe('sk')
  })

  it('does not let an older preference load overwrite a newer save', async () => {
    const request = deferred<{ targetLang: string | null }>()
    mockPreference.mockReturnValueOnce(request.promise)
    const load = useTranslationStore.getState().loadPreference()
    mockSetPreference.mockResolvedValueOnce({ targetLang: 'sk' })
    await useTranslationStore.getState().savePreference('sk')
    request.resolve({ targetLang: 'cs' })
    await load
    expect(useTranslationStore.getState().targetLang).toBe('sk')
    expect(useTranslationStore.getState().preferenceError).toBe(false)
  })

  it('does not start a stale preference load while saving', async () => {
    const write = deferred<{ targetLang: string | null }>()
    mockSetPreference.mockReturnValueOnce(write.promise)
    const save = useTranslationStore.getState().savePreference('sk')
    const load = useTranslationStore.getState().loadPreference()
    expect(mockPreference).not.toHaveBeenCalled()
    write.resolve({ targetLang: 'sk' })
    await Promise.all([save, load])
    expect(useTranslationStore.getState().targetLang).toBe('sk')
  })

  it('ignores a stale preference load failure after a newer save', async () => {
    const read = deferred<{ targetLang: string | null }>()
    mockPreference.mockReturnValueOnce(read.promise)
    const load = useTranslationStore.getState().loadPreference()
    await useTranslationStore.getState().savePreference('cs')
    read.reject(new Error('offline'))
    await load
    expect(useTranslationStore.getState().preferenceError).toBe(false)
    expect(useTranslationStore.getState().preferenceLoaded).toBe(true)
  })

  it('logs, exposes, and rejects save failures without changing the saved preference', async () => {
    useTranslationStore.setState({ targetLang: 'en', preferenceLoaded: true })
    mockSetPreference.mockRejectedValueOnce(new Error('offline'))
    await expect(useTranslationStore.getState().savePreference('cs')).rejects.toThrow('offline')
    expect(useTranslationStore.getState().targetLang).toBe('en')
    expect(useTranslationStore.getState().preferenceError).toBe(true)
    expect(console.error).toHaveBeenCalledWith('Failed to save translation preference', expect.any(Error))
    await useTranslationStore.getState().savePreference('cs')
    expect(useTranslationStore.getState().preferenceError).toBe(false)
  })

  it('allows reloading a previously loaded preference to recover from a save error', async () => {
    await useTranslationStore.getState().loadPreference()
    mockSetPreference.mockRejectedValueOnce(new Error('offline'))
    await expect(useTranslationStore.getState().savePreference('sk')).rejects.toThrow()
    expect(useTranslationStore.getState().preferenceError).toBe(true)
    await useTranslationStore.getState().loadPreference()
    expect(mockPreference).toHaveBeenCalledTimes(2)
    expect(useTranslationStore.getState().preferenceError).toBe(false)
    expect(useTranslationStore.getState().targetLang).toBe('cs')
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

  it('keeps the latest language when translation responses finish out of order', async () => {
    const older = deferred<TranslationResult>()
    const latest = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const first = useTranslationStore.getState().translate('msg-1', 'cs')
    const second = useTranslationStore.getState().translate('msg-1', 'sk')
    latest.resolve({ content: 'latest', targetLang: 'sk', detectedLang: 'en' })
    await second
    older.resolve({ content: 'stale', targetLang: 'cs', detectedLang: 'en' })
    await first
    expect(useTranslationStore.getState().translations['msg-1'].content).toBe('latest')
    expect(useTranslationStore.getState().pending).toEqual({})
  })

  it('does not clear a newer pending request when an earlier request completes', async () => {
    const older = deferred<TranslationResult>()
    const latest = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const first = useTranslationStore.getState().translate('msg-1', 'cs')
    const second = useTranslationStore.getState().translate('msg-1', 'sk')
    older.resolve({ content: 'stale', targetLang: 'cs', detectedLang: 'en' })
    await first
    expect(useTranslationStore.getState().pending['msg-1']).toBe('sk')
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
    latest.resolve({ content: 'latest', targetLang: 'sk', detectedLang: 'en' })
    await second
  })

  it('ignores a superseded failure without clearing the newer request or showing an error', async () => {
    const older = deferred<TranslationResult>()
    const latest = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const first = useTranslationStore.getState().translate('msg-1', 'cs')
    const second = useTranslationStore.getState().translate('msg-1', 'sk')
    older.reject(new Error('offline'))
    expect(await first).toBeNull()
    expect(useTranslationStore.getState().pending['msg-1']).toBe('sk')
    latest.resolve({ content: 'latest', targetLang: 'sk', detectedLang: 'en' })
    await second
  })

  it('lets selecting a cached target cancel a newer pending language request', async () => {
    await useTranslationStore.getState().translate('msg-1', 'cs')
    const request = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(request.promise)
    const pending = useTranslationStore.getState().translate('msg-1', 'sk')
    await useTranslationStore.getState().translate('msg-1', 'cs')
    expect(useTranslationStore.getState().pending).toEqual({})
    request.resolve({ content: 'stale', targetLang: 'sk', detectedLang: 'en' })
    await pending
    expect(useTranslationStore.getState().translations['msg-1'].targetLang).toBe('cs')
  })

  it('shares the pending promise and error result for the same language and revision', async () => {
    const request = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(request.promise)
    const first = useTranslationStore.getState().translate('msg-1', 'cs', 'revision-1')
    const second = useTranslationStore.getState().translate('msg-1', 'cs', 'revision-1')
    expect(first).toBe(second)
    request.reject(new Error('offline'))
    expect(await Promise.all([first, second])).toEqual(['translationError', 'translationError'])
    expect(mockTranslate).toHaveBeenCalledTimes(1)
  })

  it('reuses only translations from the same source revision', async () => {
    await useTranslationStore.getState().translate('msg-1', 'cs', 'original')
    await useTranslationStore.getState().translate('msg-1', 'cs', 'original')
    expect(mockTranslate).toHaveBeenCalledTimes(1)
    const request = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(request.promise)
    const edited = useTranslationStore.getState().translate('msg-1', 'cs', 'edited')
    expect(mockTranslate).toHaveBeenCalledTimes(2)
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
    expect(useTranslationStore.getState().pendingSourceVersions['msg-1']).toBe('edited')
    request.resolve({ content: 'edited translation', targetLang: 'cs', detectedLang: 'en' })
    await edited
    expect(useTranslationStore.getState().translations['msg-1'].sourceVersion).toBe('edited')
  })

  it('discards a pending response for an old edit revision, even with the same target language', async () => {
    const older = deferred<TranslationResult>()
    const latest = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise)
    const first = useTranslationStore.getState().translate('msg-1', 'cs', 'original')
    const second = useTranslationStore.getState().translate('msg-1', 'cs', 'edited')
    older.resolve({ content: 'stale', targetLang: 'cs', detectedLang: 'en' })
    await first
    expect(useTranslationStore.getState().pendingSourceVersions['msg-1']).toBe('edited')
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
    latest.resolve({ content: 'edited', targetLang: 'cs', detectedLang: 'en' })
    await second
    expect(useTranslationStore.getState().translations['msg-1'].content).toBe('edited')
  })

  it('invalidates cached and pending translations without touching other messages', async () => {
    await useTranslationStore.getState().translate('msg-1', 'cs', 'original')
    await useTranslationStore.getState().translate('msg-2', 'cs', 'other')
    const request = deferred<TranslationResult>()
    mockTranslate.mockReturnValueOnce(request.promise)
    const pending = useTranslationStore.getState().translate('msg-1', 'sk', 'original')
    useTranslationStore.getState().invalidate('msg-1')
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
    expect(useTranslationStore.getState().translations['msg-2']).toBeDefined()
    expect(useTranslationStore.getState().pending).toEqual({})
    expect(useTranslationStore.getState().pendingSourceVersions).toEqual({})
    request.resolve({ content: 'stale', targetLang: 'sk', detectedLang: 'en' })
    await pending
    expect(useTranslationStore.getState().translations['msg-1']).toBeUndefined()
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

  it('includes source content and editedAt in stable message versions', () => {
    const original = { content: 'hello', editedAt: null }
    const version = messageTranslationVersion(original)
    expect(messageTranslationVersion({ ...original })).toBe(version)
    expect(messageTranslationVersion({ ...original, content: 'changed' })).not.toBe(version)
    expect(messageTranslationVersion({ ...original, editedAt: '2026-10-17T12:00:00Z' })).not.toBe(version)
    expect(messageTranslationVersion({ content: null, editedAt: null })).not.toBe(
      messageTranslationVersion({ content: '', editedAt: null })
    )
  })

  describe('reset', () => {
    function expectEmptyState() {
      expect(useTranslationStore.getState()).toMatchObject({
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
      expect(useTranslationStore.getState().pending).toEqual({})
      expect(useTranslationStore.getState().pendingSourceVersions).toEqual({})
      expect(useTranslationStore.getState().translations).toEqual({})
    }

    it('clears cached setup, preferences, errors, and translations while preserving actions', async () => {
      await useTranslationStore.getState().fetchCapabilities()
      await useTranslationStore.getState().loadPreference()
      await useTranslationStore.getState().translate('msg-1', 'cs', 'original')
      useTranslationStore.setState({ capabilitiesError: true, preferenceError: true })
      const fetch = useTranslationStore.getState().fetchCapabilities
      const load = useTranslationStore.getState().loadPreference
      useTranslationStore.getState().reset()
      expectEmptyState()
      expect(useTranslationStore.getState().fetchCapabilities).toBe(fetch)
      expect(useTranslationStore.getState().loadPreference).toBe(load)
      await useTranslationStore.getState().fetchCapabilities()
      await useTranslationStore.getState().loadPreference()
      expect(mockCapabilities).toHaveBeenCalledTimes(2)
      expect(mockPreference).toHaveBeenCalledTimes(2)
    })

    it('prevents all late successful requests from repopulating reset state', async () => {
      const capabilities = deferred<TranslationCapabilities>()
      const preference = deferred<{ targetLang: string | null }>()
      const save = deferred<{ targetLang: string | null }>()
      const translation = deferred<TranslationResult>()
      mockCapabilities.mockReturnValueOnce(capabilities.promise)
      mockPreference.mockReturnValueOnce(preference.promise)
      mockSetPreference.mockReturnValueOnce(save.promise)
      mockTranslate.mockReturnValueOnce(translation.promise)
      const pending = [
        useTranslationStore.getState().fetchCapabilities(),
        useTranslationStore.getState().loadPreference(),
        useTranslationStore.getState().savePreference('sk'),
        useTranslationStore.getState().translate('msg-1', 'cs', 'original')
      ]
      useTranslationStore.getState().reset()
      expectEmptyState()
      capabilities.resolve({ enabled: true, languages: [] })
      preference.resolve({ targetLang: 'cs' })
      save.resolve({ targetLang: 'sk' })
      translation.resolve({ content: 'old account', targetLang: 'cs', detectedLang: 'en' })
      await Promise.all(pending)
      expectEmptyState()
    })

    it('ignores late failures without restoring errors or reporting previous-account failures', async () => {
      const capabilities = deferred<TranslationCapabilities>()
      const preference = deferred<{ targetLang: string | null }>()
      const save = deferred<{ targetLang: string | null }>()
      const translation = deferred<TranslationResult>()
      mockCapabilities.mockReturnValueOnce(capabilities.promise)
      mockPreference.mockReturnValueOnce(preference.promise)
      mockSetPreference.mockReturnValueOnce(save.promise)
      mockTranslate.mockReturnValueOnce(translation.promise)
      const pending = [
        useTranslationStore.getState().fetchCapabilities(),
        useTranslationStore.getState().loadPreference(),
        useTranslationStore.getState().savePreference('sk'),
        useTranslationStore.getState().translate('msg-1', 'cs', 'original')
      ]
      useTranslationStore.getState().reset()
      for (const request of [capabilities, preference, save, translation]) request.reject(new Error('old account'))
      expect(await Promise.all(pending)).toEqual([undefined, undefined, undefined, null])
      expectEmptyState()
      expect(console.error).not.toHaveBeenCalled()
    })

    it('starts fresh requests and does not let old finalizers clear the new in-flight requests', async () => {
      const oldCapabilities = deferred<TranslationCapabilities>()
      const capabilities = deferred<TranslationCapabilities>()
      const oldPreference = deferred<{ targetLang: string | null }>()
      const preference = deferred<{ targetLang: string | null }>()
      const oldSave = deferred<{ targetLang: string | null }>()
      const oldTranslation = deferred<TranslationResult>()
      const translation = deferred<TranslationResult>()
      mockCapabilities.mockReturnValueOnce(oldCapabilities.promise).mockReturnValueOnce(capabilities.promise)
      mockPreference.mockReturnValueOnce(oldPreference.promise).mockReturnValueOnce(preference.promise)
      mockSetPreference.mockReturnValueOnce(oldSave.promise)
      mockTranslate.mockReturnValueOnce(oldTranslation.promise).mockReturnValueOnce(translation.promise)
      const old = [
        useTranslationStore.getState().fetchCapabilities(),
        useTranslationStore.getState().loadPreference(),
        useTranslationStore.getState().savePreference('sk'),
        useTranslationStore.getState().translate('msg-1', 'cs', 'original')
      ]
      useTranslationStore.getState().reset()
      const currentCapabilities = useTranslationStore.getState().fetchCapabilities()
      const currentPreference = useTranslationStore.getState().loadPreference()
      const currentTranslation = useTranslationStore.getState().translate('msg-1', 'cs', 'original')
      expect(mockCapabilities).toHaveBeenCalledTimes(2)
      expect(mockPreference).toHaveBeenCalledTimes(2)
      expect(mockTranslate).toHaveBeenCalledTimes(2)
      oldCapabilities.resolve({ enabled: false, languages: [] })
      oldPreference.resolve({ targetLang: 'sk' })
      oldSave.resolve({ targetLang: 'sk' })
      oldTranslation.resolve({ content: 'old account', targetLang: 'cs', detectedLang: 'en' })
      await Promise.all(old)
      expect(useTranslationStore.getState().capabilities).toBeNull()
      expect(useTranslationStore.getState().targetLang).toBeNull()
      expect(useTranslationStore.getState().translations).toEqual({})
      expect(useTranslationStore.getState().pending['msg-1']).toBe('cs')
      expect(useTranslationStore.getState().fetchCapabilities()).toBe(currentCapabilities)
      expect(useTranslationStore.getState().loadPreference()).toBe(currentPreference)
      expect(useTranslationStore.getState().translate('msg-1', 'cs', 'original')).toBe(currentTranslation)
      capabilities.resolve({ enabled: true, languages: [] })
      preference.resolve({ targetLang: 'cs' })
      translation.resolve({ content: 'new account', targetLang: 'cs', detectedLang: 'en' })
      await Promise.all([currentCapabilities, currentPreference, currentTranslation])
      expect(useTranslationStore.getState().capabilities?.enabled).toBe(true)
      expect(useTranslationStore.getState().targetLang).toBe('cs')
      expect(useTranslationStore.getState().translations['msg-1'].content).toBe('new account')
    })

    it('does not let an old save finalizer unblock preference loading during a new save', async () => {
      const oldSave = deferred<{ targetLang: string | null }>()
      const save = deferred<{ targetLang: string | null }>()
      mockSetPreference.mockReturnValueOnce(oldSave.promise).mockReturnValueOnce(save.promise)
      const old = useTranslationStore.getState().savePreference('sk')
      useTranslationStore.getState().reset()
      const current = useTranslationStore.getState().savePreference('cs')
      oldSave.resolve({ targetLang: 'sk' })
      await old
      await useTranslationStore.getState().loadPreference()
      expect(mockPreference).not.toHaveBeenCalled()
      expect(useTranslationStore.getState().targetLang).toBeNull()
      save.resolve({ targetLang: 'cs' })
      await current
      expect(useTranslationStore.getState().targetLang).toBe('cs')
    })
  })
})
