import type { InboxGroup, InboxPage, InboxSession, InboxSessionResult } from '@chat/shared'
import { api } from '@/lib/api'
import { inboxPausesRead, useInboxStore } from './inbox.store'

jest.mock('@/lib/api', () => ({
  api: {
    getInbox: jest.fn(),
    getInboxSession: jest.fn(),
    startInboxSession: jest.fn(),
    saveInboxAnchor: jest.fn(),
    advanceInboxSession: jest.fn(),
    saveInboxLater: jest.fn(),
    removeInboxLater: jest.fn(),
    markInboxRead: jest.fn()
  }
}))

const group: InboxGroup = {
  key: 'channel:c1',
  name: 'general',
  serverName: 'Test',
  target: { mode: 'channel', contextId: 'c1', serverId: 's1', threadParentId: null, messageId: 'm1' },
  unreadCount: 3,
  mentionCount: 1,
  replyCount: 1,
  latestAt: '2026-01-01T12:00:00.000Z',
  highlights: [],
  savedAt: null
}
const second: InboxGroup = {
  ...group,
  key: 'dm:d1',
  name: 'Friend',
  target: { mode: 'dm', contextId: 'd1', serverId: null, threadParentId: null, messageId: 'm2' }
}
const page: InboxPage = {
  groups: [group],
  counts: { unread: 2, mentions: 1, replies: 1, later: 0 },
  snapshotAt: '2026-01-01T12:01:00.000Z',
  nextCursor: 'older'
}
const session: InboxSession = {
  id: 'session',
  revision: 0,
  view: 'unread',
  snapshotAt: page.snapshotAt,
  groups: [group, second],
  index: 0,
  completed: 0,
  deferred: 0,
  anchor: null
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function begin() {
  useInboxStore.setState({ session, sessionLoaded: true, snapshotAt: page.snapshotAt })
  useInboxStore.getState().resume()
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useInboxStore.getState().reset()
  useInboxStore.getState().syncUser('alice')
  jest.mocked(api.getInbox).mockResolvedValue(page)
  jest.mocked(api.getInboxSession).mockResolvedValue({ session })
  jest.mocked(api.saveInboxAnchor).mockImplementation(async (_id, revision, target) => ({
    session: { ...session, revision: revision + 1, anchor: target }
  }))
  jest
    .mocked(api.advanceInboxSession)
    .mockResolvedValue({ session: { ...session, revision: 2, index: 1, completed: 1 } })
  jest.mocked(api.saveInboxLater).mockResolvedValue({ ok: true })
  jest.mocked(api.removeInboxLater).mockResolvedValue({ ok: true })
  jest.mocked(api.markInboxRead).mockResolvedValue({ ok: true })
})
afterEach(() => jest.restoreAllMocks())

it('pages the selected server view, deduplicates groups and keeps the original order', async () => {
  await useInboxStore.getState().fetchPage()
  jest.mocked(api.getInbox).mockResolvedValueOnce({ ...page, groups: [group, second], nextCursor: undefined })
  await useInboxStore.getState().fetchPage(true)
  expect(api.getInbox).toHaveBeenLastCalledWith('unread', 'older')
  expect(useInboxStore.getState().groups).toEqual([group, second])
  useInboxStore.getState().selectTab('mentions')
  await useInboxStore.getState().fetchPage()
  expect(api.getInbox).toHaveBeenLastCalledWith('mentions', undefined)
})

it('keeps cached conversations and the retry cursor after failed requests', async () => {
  await useInboxStore.getState().fetchPage()
  jest.mocked(api.getInbox).mockRejectedValue(new Error('offline'))
  await useInboxStore.getState().fetchPage(true)
  expect(useInboxStore.getState()).toMatchObject({
    groups: [group],
    nextCursor: 'older',
    error: 'load',
    loading: false
  })
  await useInboxStore.getState().fetchPage()
  expect(useInboxStore.getState()).toMatchObject({ groups: [group], nextCursor: 'older', error: 'load' })
})

it('ignores stale pages when the view changes', async () => {
  const waiting = deferred<InboxPage>()
  jest.mocked(api.getInbox).mockReturnValueOnce(waiting.promise)
  const loading = useInboxStore.getState().fetchPage()
  useInboxStore.getState().selectTab('later')
  waiting.resolve(page)
  await loading
  expect(useInboxStore.getState()).toMatchObject({ tab: 'later', groups: [], snapshotAt: null })
})

it('ignores old-account page and session responses after logout', async () => {
  const waiting = deferred<InboxPage>()
  const resume = deferred<InboxSessionResult>()
  jest.mocked(api.getInbox).mockReturnValueOnce(waiting.promise)
  jest.mocked(api.getInboxSession).mockReturnValueOnce(resume.promise)
  const requests = [useInboxStore.getState().fetchPage(), useInboxStore.getState().loadSession()]
  useInboxStore.getState().syncUser('bob')
  waiting.resolve(page)
  resume.resolve({ session })
  await Promise.all(requests)
  expect(useInboxStore.getState()).toMatchObject({ userId: 'bob', groups: [], session: null, sessionLoaded: false })
})

it('previews without acknowledging and pauses normal read through the entire transition', async () => {
  await useInboxStore.getState().fetchPage()
  useInboxStore.getState().show()
  expect(inboxPausesRead('dm', 'anything')).toBe(true)
  useInboxStore.getState().read(group)
  expect(inboxPausesRead('channel', 'c1')).toBe(true)
  expect(inboxPausesRead('dm', 'd1')).toBe(false)
  expect(api.markInboxRead).not.toHaveBeenCalled()
  expect(useInboxStore.getState().reader).toMatchObject({
    group,
    target: group.target,
    snapshotAt: page.snapshotAt,
    sessionId: null
  })
})

it('marks a group read only through the fetched snapshot', async () => {
  await useInboxStore.getState().fetchPage()
  await useInboxStore.getState().markRead(group)
  expect(api.markInboxRead).toHaveBeenCalledWith(group.target, page.snapshotAt)
})

it('freezes the catch-up order when new activity arrives', async () => {
  jest.mocked(api.startInboxSession).mockResolvedValue({ session })
  await useInboxStore.getState().start()
  useInboxStore.getState().bump()
  expect(useInboxStore.getState()).toMatchObject({ session, newActivity: true, open: false })
  expect(api.getInbox).not.toHaveBeenCalled()
})

it('does not replace the frozen queue on a double start', async () => {
  jest.mocked(api.startInboxSession).mockResolvedValue({ session })
  await Promise.all([useInboxStore.getState().start(true), useInboxStore.getState().start(true)])
  expect(api.startInboxSession).toHaveBeenCalledTimes(1)
})

it('resumes a saved thread message rather than the initial group target', () => {
  const target = { ...group.target, threadParentId: 'parent', messageId: 'reply' }
  useInboxStore.setState({
    session: { ...session, groups: [{ ...group, target }], anchor: { ...target, messageId: 'last-visible' } }
  })
  useInboxStore.getState().resume()
  expect(useInboxStore.getState().reader?.target.messageId).toBe('last-visible')
  expect(api.markInboxRead).not.toHaveBeenCalled()
})

it('serializes anchor and advance requests using the latest revision', async () => {
  begin()
  const waiting = deferred<InboxSessionResult>()
  const started = deferred<void>()
  jest.mocked(api.saveInboxAnchor).mockImplementationOnce(() => {
    started.resolve()
    return waiting.promise
  })
  const target = { ...group.target, messageId: 'm-visible' }
  useInboxStore.getState().stageAnchor(target)
  const saving = useInboxStore.getState().saveAnchor(target)
  const advancing = useInboxStore.getState().advance('done')
  await started.promise
  expect(api.advanceInboxSession).not.toHaveBeenCalled()
  waiting.resolve({ session: { ...session, revision: 1, anchor: target } })
  await Promise.all([saving, advancing])
  expect(api.advanceInboxSession).toHaveBeenCalledWith('session', 1, 'done')
  expect(useInboxStore.getState().reader?.group.key).toBe(second.key)
})

it('flushes the latest staged anchor before saving Later', async () => {
  begin()
  const target = { ...group.target, messageId: 'latest-visible' }
  useInboxStore.getState().stageAnchor(target)
  await useInboxStore.getState().advance('later')
  expect(api.saveInboxAnchor).toHaveBeenCalledWith('session', 0, target)
  expect(api.advanceInboxSession).toHaveBeenCalledWith('session', 1, 'later')
})

it('does not advance or lose the latest visible position if saving it fails', async () => {
  begin()
  const target = { ...group.target, messageId: 'latest-visible' }
  useInboxStore.getState().stageAnchor(target)
  jest.mocked(api.saveInboxAnchor).mockRejectedValueOnce(new Error('offline'))
  expect(await useInboxStore.getState().advance('later')).toBe(false)
  expect(api.advanceInboxSession).not.toHaveBeenCalled()
  expect(useInboxStore.getState()).toMatchObject({ error: 'action', session, reader: { target } })
})

it('skips an unavailable target without trying to save or mark it read', async () => {
  begin()
  await useInboxStore.getState().advance('skip')
  expect(api.saveInboxAnchor).not.toHaveBeenCalled()
  expect(api.advanceInboxSession).toHaveBeenCalledWith('session', 0, 'skip')
  expect(api.markInboxRead).not.toHaveBeenCalled()
})

it('does not advance two groups on a double click', async () => {
  begin()
  await Promise.all([useInboxStore.getState().advance('skip'), useInboxStore.getState().advance('skip')])
  expect(api.advanceInboxSession).toHaveBeenCalledTimes(1)
})

it('does not let a late anchor response overwrite a newer local reading position', async () => {
  begin()
  const waiting = deferred<InboxSessionResult>()
  const started = deferred<void>()
  jest.mocked(api.saveInboxAnchor).mockImplementationOnce(() => {
    started.resolve()
    return waiting.promise
  })
  const target = { ...group.target, messageId: 'earlier' }
  useInboxStore.getState().stageAnchor(target)
  const saving = useInboxStore.getState().saveAnchor(target)
  await started.promise
  useInboxStore.getState().stageAnchor({ ...target, messageId: 'newer' })
  waiting.resolve({ session: { ...session, revision: 1, anchor: target } })
  await saving
  expect(useInboxStore.getState().reader?.target.messageId).toBe('newer')
})

it('rejects stale cross-device progress and loads the authoritative session', async () => {
  begin()
  const current = { ...session, revision: 4, index: 1 }
  jest.mocked(api.advanceInboxSession).mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
  jest.mocked(api.getInboxSession).mockResolvedValue({ session: current })
  expect(await useInboxStore.getState().advance('skip')).toBe(false)
  expect(useInboxStore.getState()).toMatchObject({ error: 'conflict', session: current, reader: { group } })
  await useInboxStore.getState().advance('done')
  expect(api.advanceInboxSession).toHaveBeenCalledTimes(1)
  useInboxStore.getState().resume()
  expect(useInboxStore.getState().reader?.group.key).toBe(second.key)
})

it('does not overwrite a mutation with an older session-load response', async () => {
  begin()
  const waiting = deferred<InboxSessionResult>()
  jest.mocked(api.getInboxSession).mockReturnValueOnce(waiting.promise)
  const loading = useInboxStore.getState().loadSession()
  await useInboxStore.getState().advance('skip')
  waiting.resolve({ session })
  await loading
  expect(useInboxStore.getState().session?.index).toBe(1)
})

it('opens Inbox before releasing the read guard at the end of the queue', async () => {
  begin()
  jest.mocked(api.advanceInboxSession).mockResolvedValueOnce({ session: { ...session, index: 2, revision: 1 } })
  await useInboxStore.getState().advance('skip')
  expect(useInboxStore.getState()).toMatchObject({ open: true, reader: null })
  expect(inboxPausesRead('channel', 'c1')).toBe(true)
})

it('keeps failed Later changes retryable and refreshes only after success', async () => {
  jest.mocked(api.saveInboxLater).mockRejectedValueOnce(new Error('offline'))
  expect(await useInboxStore.getState().saveLater(group.target)).toBe(false)
  expect(api.getInbox).not.toHaveBeenCalled()
  expect(useInboxStore.getState().error).toBe('action')
  expect(await useInboxStore.getState().saveLater(group.target)).toBe(true)
  expect(api.getInbox).toHaveBeenCalledTimes(1)
  await useInboxStore.getState().removeLater(group.target)
  expect(api.removeInboxLater).toHaveBeenCalledWith(group.target)
})

it('retries the actual failed Later operation before refreshing', async () => {
  jest.mocked(api.saveInboxLater).mockRejectedValueOnce(new Error('offline'))
  await useInboxStore.getState().saveLater(group.target)
  await useInboxStore.getState().retry()
  expect(api.saveInboxLater).toHaveBeenCalledTimes(2)
  expect(api.getInbox).toHaveBeenCalledTimes(1)
})

it('does not swallow incoming activity while a refresh is in flight or append an older page', async () => {
  const waiting = deferred<InboxPage>()
  jest.mocked(api.getInbox).mockReturnValueOnce(waiting.promise)
  const loading = useInboxStore.getState().fetchPage()
  useInboxStore.getState().bump()
  waiting.resolve(page)
  await loading
  expect(useInboxStore.getState().newActivity).toBe(true)
  await useInboxStore.getState().fetchPage(true)
  expect(useInboxStore.getState().newActivity).toBe(true)
  await useInboxStore.getState().fetchPage()
  expect(useInboxStore.getState().newActivity).toBe(false)
})

it('turns a newly unavailable target into a localized Skip-only session entry', async () => {
  begin()
  jest.mocked(api.advanceInboxSession).mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 410 }))
  jest.mocked(api.getInboxSession).mockResolvedValueOnce({
    session: {
      ...session,
      revision: 1,
      groups: [{ ...group, unavailable: true, name: 'Unavailable', highlights: [] }, second]
    }
  })
  expect(await useInboxStore.getState().advance('done')).toBe(false)
  expect(useInboxStore.getState()).toMatchObject({ error: 'unavailable', reader: { group: { unavailable: true } } })
  expect(await useInboxStore.getState().advance('skip')).toBe(true)
})

it('pauses reading at the saved anchor without acknowledging or advancing the session', async () => {
  begin()
  useInboxStore.getState().confirmNavigation('channel', 'c1', 'm1', null)
  const target = { ...group.target, messageId: 'visible' }
  useInboxStore.getState().stageAnchor(target)
  expect(await useInboxStore.getState().returnToInbox()).toBe(true)
  expect(useInboxStore.getState()).toMatchObject({
    open: true,
    reader: null,
    session: { anchor: target, index: 0, completed: 0 }
  })
  expect(api.advanceInboxSession).not.toHaveBeenCalled()
  expect(api.markInboxRead).not.toHaveBeenCalled()
})
