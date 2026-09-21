import { create } from 'zustand'
import { api } from '@/lib/api'
import type { TranslationCapabilities, TranslationResult } from '@/lib/api'

export interface StoredTranslation extends TranslationResult {
  /** User hid the translation block; the text is kept so it can be re-shown. */
  hidden: boolean
}

interface TranslationState {
  capabilities: TranslationCapabilities | null
  capabilitiesLoaded: boolean
  /** The user's saved default target language (null = not set). */
  targetLang: string | null
  /** messageId -> target language currently being fetched (dedupes double-clicks). */
  pending: Record<string, string>
  /** Session-only translations: messageId -> result. Never persisted anywhere. */
  translations: Record<string, StoredTranslation>

  fetchCapabilities: () => Promise<void>
  loadPreference: () => Promise<void>
  savePreference: (targetLang: string | null) => Promise<void>
  /**
   * Translate a message into the given language. Returns an error-message
   * string (already i18n-free; caller shows a toast) or null on success.
   * A second call for the same message+language is a no-op while pending.
   */
  translate: (messageId: string, targetLang: string) => Promise<string | null>
  toggleHidden: (messageId: string) => void
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  capabilities: null,
  capabilitiesLoaded: false,
  targetLang: null,
  pending: {},
  translations: {},

  fetchCapabilities: async () => {
    if (get().capabilitiesLoaded) return
    try {
      const capabilities = await api.getTranslationCapabilities()
      set({ capabilities, capabilitiesLoaded: true })
    } catch {
      // Treat failure as "not configured" — the UI hides the action.
      set({ capabilities: { enabled: false, languages: [] }, capabilitiesLoaded: true })
    }
  },

  loadPreference: async () => {
    try {
      const { targetLang } = await api.getTranslationPreference()
      set({ targetLang })
    } catch {
      // Non-fatal — fall back to the client-locale default.
    }
  },

  savePreference: async (targetLang) => {
    const { targetLang: saved } = await api.setTranslationPreference(targetLang)
    set({ targetLang: saved })
  },

  translate: async (messageId, targetLang) => {
    const existing = get().translations[messageId]
    if (existing && existing.targetLang === targetLang) return null
    const pending = get().pending
    if (pending[messageId] === targetLang) return null

    const nextPending = { ...pending, [messageId]: targetLang }
    set({ pending: nextPending })
    try {
      const result = await api.translateMessage(messageId, targetLang)
      set((s) => ({
        pending: Object.fromEntries(Object.entries(s.pending).filter(([id, t]) => !(id === messageId && t === targetLang))),
        translations: { ...s.translations, [messageId]: { ...result, hidden: false } }
      }))
      return null
    } catch {
      set((s) => ({
        pending: Object.fromEntries(Object.entries(s.pending).filter(([id, t]) => !(id === messageId && t === targetLang)))
      }))
      return 'translationError'
    }
  },

  toggleHidden: (messageId) => {
    const tr = get().translations[messageId]
    if (!tr) return
    set((s) => ({
      translations: { ...s.translations, [messageId]: { ...tr, hidden: !tr.hidden } }
    }))
  }
}))
