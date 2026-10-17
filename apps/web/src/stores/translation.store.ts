import { create } from 'zustand'
import { api } from '@/lib/api'
import type { TranslationCapabilities, TranslationResult } from '@/lib/api'

export interface StoredTranslation extends TranslationResult {
  /** User hid the translation block; the text is kept so it can be re-shown. */
  hidden: boolean
  sourceVersion?: string
}

interface TranslationState {
  capabilities: TranslationCapabilities | null
  capabilitiesLoaded: boolean
  capabilitiesError: boolean
  preferenceLoaded: boolean
  preferenceError: boolean
  /** The user's saved default target language (null = not set). */
  targetLang: string | null
  /** messageId -> target language currently being fetched (dedupes double-clicks). */
  pending: Record<string, string>
  pendingSourceVersions: Record<string, string | undefined>
  /** Session-only translations: messageId -> result. Never persisted anywhere. */
  translations: Record<string, StoredTranslation>

  fetchCapabilities: () => Promise<void>
  loadPreference: () => Promise<void>
  savePreference: (targetLang: string | null) => Promise<void>
  /**
   * Translate a message into the given language. Returns an error-message
   * string (already i18n-free; caller shows a toast) or null on success.
   * Concurrent calls for the same message, language and source revision share
   * a request. Only the latest request for a message can update its result.
   */
  translate: (messageId: string, targetLang: string, sourceVersion?: string) => Promise<string | null>
  invalidate: (messageId: string) => void
  reset: () => void
  toggleHidden: (messageId: string) => void
}

export const useTranslationStore = create<TranslationState>((set, get) => {
  let capabilitiesRequest: Promise<void> | undefined
  let preferenceRequest: Promise<void> | undefined
  let requestEpoch = 0
  let preferenceRevision = 0
  let preferenceSaves = 0
  const requests = new Map<
    string,
    {
      targetLang: string
      sourceVersion?: string
      promise: Promise<string | null>
    }
  >()

  const clearPending = (messageId: string) => {
    set((s) => {
      const pending = { ...s.pending }
      const pendingSourceVersions = { ...s.pendingSourceVersions }
      delete pending[messageId]
      delete pendingSourceVersions[messageId]
      return { pending, pendingSourceVersions }
    })
  }

  return {
    capabilities: null,
    capabilitiesLoaded: false,
    capabilitiesError: false,
    preferenceLoaded: false,
    preferenceError: false,
    targetLang: null,
    pending: {},
    pendingSourceVersions: {},
    translations: {},

    fetchCapabilities: () => {
      if (capabilitiesRequest) return capabilitiesRequest
      if (get().capabilitiesLoaded) return Promise.resolve()
      const epoch = requestEpoch
      set({ capabilitiesError: false })
      capabilitiesRequest = api
        .getTranslationCapabilities()
        .then((capabilities) => {
          if (epoch !== requestEpoch) return
          set({ capabilities, capabilitiesLoaded: true, capabilitiesError: false })
        })
        .catch((error: unknown) => {
          if (epoch !== requestEpoch) return
          console.error('Failed to load translation capabilities', error)
          set({ capabilitiesError: true })
        })
        .finally(() => {
          if (epoch === requestEpoch) capabilitiesRequest = undefined
        })
      return capabilitiesRequest
    },

    loadPreference: () => {
      if (preferenceRequest) return preferenceRequest
      if ((get().preferenceLoaded && !get().preferenceError) || preferenceSaves > 0) return Promise.resolve()
      const epoch = requestEpoch
      const revision = preferenceRevision
      set({ preferenceError: false })
      preferenceRequest = api
        .getTranslationPreference()
        .then(({ targetLang }) => {
          if (epoch === requestEpoch && revision === preferenceRevision) {
            set({ targetLang, preferenceLoaded: true, preferenceError: false })
          }
        })
        .catch((error: unknown) => {
          if (epoch !== requestEpoch) return
          console.error('Failed to load translation preference', error)
          if (revision === preferenceRevision) set({ preferenceError: true })
        })
        .finally(() => {
          if (epoch === requestEpoch) preferenceRequest = undefined
        })
      return preferenceRequest
    },

    savePreference: async (targetLang) => {
      const epoch = requestEpoch
      const revision = ++preferenceRevision
      preferenceSaves++
      set({ preferenceError: false })
      try {
        const { targetLang: saved } = await api.setTranslationPreference(targetLang)
        if (epoch === requestEpoch && revision === preferenceRevision) {
          set({ targetLang: saved, preferenceLoaded: true, preferenceError: false })
        }
      } catch (error) {
        if (epoch !== requestEpoch) return
        console.error('Failed to save translation preference', error)
        if (revision === preferenceRevision) set({ preferenceError: true })
        throw error
      } finally {
        if (epoch === requestEpoch) preferenceSaves--
      }
    },

    translate: (messageId, targetLang, sourceVersion) => {
      const pendingRequest = requests.get(messageId)
      if (pendingRequest?.targetLang === targetLang && pendingRequest.sourceVersion === sourceVersion) {
        return pendingRequest.promise
      }
      const existing = get().translations[messageId]
      if (existing?.targetLang === targetLang && existing.sourceVersion === sourceVersion) {
        requests.delete(messageId)
        if (get().pending[messageId]) clearPending(messageId)
        if (existing.hidden) get().toggleHidden(messageId)
        return Promise.resolve(null)
      }

      if (existing && existing.sourceVersion !== sourceVersion) get().invalidate(messageId)
      const request = {
        targetLang,
        sourceVersion,
        promise: Promise.resolve<string | null>(null)
      }
      requests.set(messageId, request)
      set((s) => ({
        pending: { ...s.pending, [messageId]: targetLang },
        pendingSourceVersions: { ...s.pendingSourceVersions, [messageId]: sourceVersion }
      }))
      request.promise = (async () => {
        try {
          const result = await api.translateMessage(messageId, targetLang)
          if (requests.get(messageId) !== request) return null
          set((s) => ({
            translations: {
              ...s.translations,
              [messageId]: { ...result, hidden: false, ...(sourceVersion !== undefined && { sourceVersion }) }
            }
          }))
          return null
        } catch {
          return requests.get(messageId) === request ? 'translationError' : null
        } finally {
          if (requests.get(messageId) === request) {
            requests.delete(messageId)
            clearPending(messageId)
          }
        }
      })()
      return request.promise
    },

    invalidate: (messageId) => {
      requests.delete(messageId)
      set((s) => {
        const translations = { ...s.translations }
        const pending = { ...s.pending }
        const pendingSourceVersions = { ...s.pendingSourceVersions }
        delete translations[messageId]
        delete pending[messageId]
        delete pendingSourceVersions[messageId]
        return { translations, pending, pendingSourceVersions }
      })
    },

    reset: () => {
      requestEpoch++
      preferenceRevision++
      preferenceSaves = 0
      capabilitiesRequest = undefined
      preferenceRequest = undefined
      requests.clear()
      set({
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
    },

    toggleHidden: (messageId) => {
      const tr = get().translations[messageId]
      if (!tr) return
      set((s) => ({
        translations: { ...s.translations, [messageId]: { ...tr, hidden: !tr.hidden } }
      }))
    }
  }
})
