import type { InboxGroup, InboxSession, InboxTarget, InboxView } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'

export type InboxTab = InboxView | 'activity'
export interface InboxReader {
  requestId: number
  navigated: boolean
  group: InboxGroup
  target: InboxTarget
  snapshotAt: string
  sessionId: string | null
}
type InboxError = 'load' | 'action' | 'conflict' | 'resume' | 'unavailable' | null
interface InboxState {
  userId: string | null
  open: boolean
  tab: InboxTab
  groups: InboxGroup[]
  counts: Record<InboxView, number>
  snapshotAt: string | null
  nextCursor?: string
  loading: boolean
  pending: boolean
  error: InboxError
  session: InboxSession | null
  sessionLoaded: boolean
  reader: InboxReader | null
  newActivity: boolean
  syncUser: (userId: string | null) => void
  show: () => void
  close: () => void
  selectTab: (tab: InboxTab) => void
  fetchPage: (append?: boolean) => Promise<void>
  loadSession: () => Promise<void>
  start: (replace?: boolean) => Promise<boolean>
  read: (group: InboxGroup, inSession?: boolean) => void
  resume: () => void
  returnToInbox: () => Promise<boolean>
  saveAnchor: (target: InboxTarget) => Promise<boolean>
  stageAnchor: (target: InboxTarget) => void
  confirmNavigation: (
    mode: InboxTarget['mode'],
    contextId: string,
    messageId: string,
    threadParentId: string | null
  ) => void
  advance: (action: 'done' | 'later' | 'skip') => Promise<boolean>
  saveLater: (target: InboxTarget) => Promise<boolean>
  removeLater: (target: InboxTarget) => Promise<boolean>
  markRead: (group: InboxGroup) => Promise<boolean>
  retry: () => Promise<boolean>
  bump: () => void
  reset: () => void
}

const initial = {
  userId: null,
  open: false,
  tab: 'unread' as InboxTab,
  groups: [] as InboxGroup[],
  counts: { unread: 0, mentions: 0, replies: 0, later: 0 },
  snapshotAt: null,
  nextCursor: undefined,
  loading: false,
  pending: false,
  error: null,
  session: null,
  sessionLoaded: false,
  reader: null,
  newActivity: false
}
let epoch = 0
let pageRequest = 0
let sessionRequest = 0
let writes: Promise<unknown> = Promise.resolve()
let readerRequest = 0
let activityRevision = 0
let failedOperation: (() => Promise<boolean>) | null = null

export const useInboxStore = create<InboxState>((set, get) => {
  async function mutate(operation: () => Promise<void>): Promise<boolean> {
    const generation = epoch
    const run = async () => {
      if (generation !== epoch) return false
      sessionRequest++
      set({ pending: true, error: null })
      failedOperation = null
      try {
        await operation()
        return generation === epoch
      } catch (error) {
        console.error('Inbox action failed', error)
        if (generation === epoch) {
          failedOperation = () => mutate(operation)
          const conflict = error instanceof Error && 'status' in error && error.status === 409
          const unavailable = error instanceof Error && 'status' in error && error.status === 410
          set({ error: conflict ? 'conflict' : unavailable ? 'unavailable' : 'action' })
          if (conflict || unavailable) {
            try {
              const result = await api.getInboxSession()
              if (generation === epoch)
                set((s) => {
                  const current = result.session?.groups[result.session.index]
                  return {
                    session: result.session,
                    sessionLoaded: true,
                    ...(unavailable && current?.unavailable && s.reader?.group.key === current.key
                      ? { reader: { ...s.reader, group: current } }
                      : {})
                  }
                })
            } catch (reloadError) {
              console.error('Could not reload conflicting catch-up session', reloadError)
              if (generation === epoch) set({ error: 'resume' })
            }
          }
        }
        return false
      } finally {
        if (generation === epoch) set({ pending: false })
      }
    }
    const result = writes.then(run)
    writes = result
    return result
  }
  async function targetAction(operation: () => Promise<unknown>): Promise<boolean> {
    const generation = epoch
    const success = await mutate(async () => {
      await operation()
    })
    if (success && generation === epoch) await get().fetchPage()
    else if (generation === epoch && get().error === 'action') failedOperation = () => targetAction(operation)
    return success
  }
  return {
    ...initial,
    syncUser: (userId) => {
      if (get().userId === userId) return
      get().reset()
      set({ userId })
    },
    reset: () => {
      epoch++
      pageRequest++
      sessionRequest++
      writes = Promise.resolve()
      failedOperation = null
      set(initial)
    },
    show: () => set((s) => ({ open: true, loading: s.tab !== 'activity' && !s.snapshotAt })),
    close: () => set({ open: false }),
    selectTab: (tab) => {
      if (get().tab === tab) return
      pageRequest++
      set({ tab, groups: [], nextCursor: undefined, snapshotAt: null, error: null, loading: false })
    },
    fetchPage: async (append = false) => {
      const { tab, nextCursor } = get()
      if (tab === 'activity' || (append && (!nextCursor || get().loading))) return
      const generation = epoch
      const request = ++pageRequest
      const activityAtStart = activityRevision
      set({ loading: true, error: null })
      try {
        const page = await api.getInbox(tab, append ? nextCursor : undefined)
        if (generation !== epoch || request !== pageRequest) return
        set((s) => ({
          groups: append
            ? [...s.groups, ...page.groups.filter((group) => !s.groups.some((old) => old.key === group.key))]
            : page.groups,
          counts: page.counts,
          snapshotAt: page.snapshotAt,
          nextCursor: page.nextCursor,
          newActivity: append ? s.newActivity : activityRevision !== activityAtStart
        }))
      } catch (error) {
        console.error('Failed to load Inbox', error)
        if (generation === epoch && request === pageRequest) set({ error: 'load' })
      } finally {
        if (generation === epoch && request === pageRequest) set({ loading: false })
      }
    },
    loadSession: async () => {
      if (get().pending) return
      const generation = epoch
      const request = ++sessionRequest
      try {
        const result = await api.getInboxSession()
        if (generation === epoch && request === sessionRequest)
          set((s) => ({
            session: result.session,
            sessionLoaded: true,
            error: s.error === 'resume' ? null : s.error
          }))
      } catch (error) {
        console.error('Failed to load catch-up session', error)
        if (generation === epoch && request === sessionRequest) set({ error: 'resume' })
      }
    },
    start: (replace = false) => {
      const expectedReader = get().reader?.requestId
      return mutate(async () => {
        if (get().reader?.requestId !== expectedReader) return
        const generation = epoch
        const tab = get().tab
        const result = await api.startInboxSession(tab === 'activity' ? 'unread' : tab, replace)
        if (generation !== epoch) return
        sessionRequest++
        set({ session: result.session, sessionLoaded: true })
        get().resume()
      })
    },
    read: (group, inSession = false) => {
      const session = get().session
      const target = inSession && session?.anchor ? session.anchor : group.target
      const snapshotAt =
        inSession && session
          ? session.snapshotAt
          : (get().snapshotAt ?? (get().reader?.group.key === group.key ? get().reader?.snapshotAt : null))
      if (!snapshotAt) {
        console.error('Inbox preview requires a loaded activity snapshot')
        set({ error: 'load', open: true })
        return
      }
      set({
        open: false,
        error: null,
        reader: {
          requestId: ++readerRequest,
          navigated: !target.messageId,
          group,
          target,
          snapshotAt,
          sessionId: inSession ? (session?.id ?? null) : null
        }
      })
    },
    resume: () => {
      const session = get().session
      const group = session?.groups[session.index]
      if (group) get().read(group, true)
      else set({ open: true, reader: null })
    },
    returnToInbox: async () => {
      const reader = get().reader
      if (
        reader?.sessionId &&
        reader.navigated &&
        !reader.group.unavailable &&
        !(await get().saveAnchor(reader.target))
      )
        return false
      if (get().reader?.requestId === reader?.requestId) set({ open: true, reader: null })
      return true
    },
    stageAnchor: (target) => {
      const reader = get().reader
      if (
        !reader ||
        reader.target.mode !== target.mode ||
        reader.target.contextId !== target.contextId ||
        reader.target.threadParentId !== target.threadParentId ||
        reader.target.messageId === target.messageId
      )
        return
      set({ reader: { ...reader, target } })
    },
    confirmNavigation: (mode, contextId, messageId, threadParentId) => {
      const reader = get().reader
      if (
        !reader ||
        reader.navigated ||
        reader.target.mode !== mode ||
        reader.target.contextId !== contextId ||
        reader.target.messageId !== messageId ||
        reader.target.threadParentId !== threadParentId
      )
        return
      set({ reader: { ...reader, navigated: true } })
    },
    saveAnchor: (target) =>
      mutate(async () => {
        const generation = epoch
        const { session, reader } = get()
        if (!session || !reader?.sessionId || session.id !== reader.sessionId) return
        const group = session.groups[session.index]
        if (
          !group ||
          group.unavailable ||
          group.target.mode !== target.mode ||
          group.target.contextId !== target.contextId ||
          group.target.threadParentId !== target.threadParentId
        )
          return
        if (JSON.stringify(session.anchor) === JSON.stringify(target)) return
        const result = await api.saveInboxAnchor(session.id, session.revision, target)
        if (generation === epoch) {
          sessionRequest++
          set({ session: result.session })
        }
      }),
    advance: (action) => {
      const expectedReader = get().reader?.requestId
      return mutate(async () => {
        const generation = epoch
        let { session } = get()
        const reader = get().reader
        if (!session || !reader || reader.requestId !== expectedReader) return
        if (session.id !== reader.sessionId || session.groups[session.index]?.key !== reader.group.key) {
          throw Object.assign(new Error('Catch-up progress changed; resume the current conversation'), { status: 409 })
        }
        if (action !== 'skip' && JSON.stringify(session.anchor) !== JSON.stringify(reader.target)) {
          const anchored = await api.saveInboxAnchor(session.id, session.revision, reader.target)
          if (generation !== epoch) return
          session = anchored.session
          if (!session) throw new Error('Catch-up session disappeared while saving its position')
          set({ session })
        }
        const result = await api.advanceInboxSession(session.id, session.revision, action)
        if (generation !== epoch) return
        sessionRequest++
        set({ session: result.session })
        get().resume()
      })
    },
    saveLater: (target) => targetAction(() => api.saveInboxLater(target)),
    removeLater: (target) => targetAction(() => api.removeInboxLater(target)),
    retry: async () => {
      const error = get().error
      if (error === 'unavailable') {
        if (get().reader?.sessionId) {
          await get().loadSession()
          if (get().error === 'resume') return false
          get().resume()
        } else await get().fetchPage()
        return !get().error
      }
      if (error === 'load') {
        await get().fetchPage()
        return !get().error
      }
      if (error === 'resume' || error === 'conflict') {
        await get().loadSession()
        if (get().error === 'resume') return false
        if (error === 'conflict') get().resume()
        return true
      }
      return failedOperation ? failedOperation() : false
    },
    markRead: (group) => {
      const snapshotAt = get().snapshotAt
      if (!snapshotAt) {
        console.error('Inbox acknowledgement requires a loaded activity snapshot')
        set({ error: 'load' })
        return Promise.resolve(false)
      }
      return targetAction(() => api.markInboxRead(group.target, snapshotAt))
    },
    bump: () => {
      activityRevision++
      if (!get().newActivity) set({ newActivity: true })
    }
  }
})

export function inboxPausesRead(mode: 'channel' | 'dm', contextId: string): boolean {
  const { open, reader } = useInboxStore.getState()
  return open || (reader?.target.mode === mode && reader.target.contextId === contextId)
}
