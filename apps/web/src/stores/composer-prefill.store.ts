import { create } from 'zustand'

type Pending = {
  contextId: string
  /** `null` = main channel composer; non-null = thread composer for that parent */
  threadParentId: string | null
  text: string
}

type ComposerPrefillState = {
  pending: Pending | null
  setPrefill: (contextId: string, threadParentId: string | null, text: string) => void
  consumePrefill: (contextId: string, threadParentId: string | null) => string | null
}

export const useComposerPrefillStore = create<ComposerPrefillState>((set, get) => ({
  pending: null,

  setPrefill: (contextId, threadParentId, text) => {
    set({ pending: { contextId, threadParentId, text } })
  },

  consumePrefill: (contextId, threadParentId) => {
    const p = get().pending
    if (!p || p.contextId !== contextId) return null
    if ((p.threadParentId ?? null) !== threadParentId) return null
    set({ pending: null })
    return p.text
  }
}))
