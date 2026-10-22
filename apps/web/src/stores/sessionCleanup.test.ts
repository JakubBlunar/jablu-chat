import { cleanupSession, type SessionCleanupStep } from './sessionCleanup'
import { useDmStore } from './dm.store'
import { useMemberStore } from './member.store'
import { useThreadStore } from './thread.store'
import { useForumReplyStore } from './forumReply.store'
import { useBookmarkStore } from './bookmark.store'
import { useVoiceConnectionStore } from './voice-connection.store'
import { purgeCache } from '@/lib/cache/persistence'

const calls: string[] = []

function mockStore(name: string) {
  const record = (action: string) =>
    jest.fn(() => {
      calls.push(`${name}.${action}`)
    })
  const state = {
    clearMessages: record('clearMessages'),
    closeThread: record('closeThread'),
    reset: record('reset'),
    disconnect: record('disconnect'),
    clear: record('clear'),
    syncUser: record('syncUser')
  }
  return { getState: () => state, setState: record('setState') }
}

jest.mock('./server.store', () => ({ useServerStore: mockStore('server') }))
jest.mock('./activity.store', () => ({ useActivityStore: mockStore('activity') }))
jest.mock('./serverLayout.store', () => ({ useServerLayoutStore: mockStore('serverLayout') }))
jest.mock('./channel.store', () => ({ useChannelStore: mockStore('channel') }))
jest.mock('./member.store', () => ({ useMemberStore: mockStore('member') }))
jest.mock('./message.store', () => ({ useMessageStore: mockStore('message') }))
jest.mock('./dm.store', () => ({ useDmStore: mockStore('dm') }))
jest.mock('./thread.store', () => ({ useThreadStore: mockStore('thread') }))
jest.mock('./forumReply.store', () => ({ useForumReplyStore: mockStore('forumReply') }))
jest.mock('./forum.store', () => ({ useForumStore: mockStore('forum') }))
jest.mock('./bookmark.store', () => ({ useBookmarkStore: mockStore('bookmark') }))
jest.mock('./inbox.store', () => ({ useInboxStore: mockStore('inbox') }))
jest.mock('./notificationCenter.store', () => ({ useNotificationCenterStore: mockStore('notifications') }))
jest.mock('./dmCall.store', () => ({ useDmCallStore: mockStore('dmCall') }))
jest.mock('./readState.store', () => ({ useReadStateStore: mockStore('readState') }))
jest.mock('./notifPref.store', () => ({ useNotifPrefStore: mockStore('notifPref') }))
jest.mock('./voice.store', () => ({ useVoiceStore: mockStore('voice') }))
jest.mock('./voice-connection.store', () => ({ useVoiceConnectionStore: mockStore('voiceConnection') }))
jest.mock('./layout.store', () => ({ useLayoutStore: mockStore('layout') }))
jest.mock('./navigation.store', () => ({ useNavigationStore: mockStore('navigation') }))
jest.mock('./event.store', () => ({ useEventStore: mockStore('event') }))
jest.mock('./channel-permissions.store', () => ({ useChannelPermissionsStore: mockStore('permissions') }))
jest.mock('./navHistory.store', () => ({ useNavHistoryStore: mockStore('history') }))
jest.mock('@/lib/socket', () => ({
  disconnectSocket: jest.fn(() => {
    calls.push('socket.disconnect')
  })
}))
jest.mock('@/lib/cache/messageCache', () => ({
  clearCache: jest.fn(() => {
    calls.push('cache.clear')
  })
}))
jest.mock('@/lib/cache/structureCache', () => ({
  clearStructureCache: jest.fn(() => {
    calls.push('structure.clear')
  })
}))
jest.mock('@/lib/cache/persistence', () => ({
  stopCachePersistence: jest.fn(() => {
    calls.push('persistence.stop')
  }),
  purgeCache: jest.fn(async () => {
    calls.push('persistence.purge')
  })
}))
jest.mock('@/lib/messageOutbox', () => {
  throw new Error('Session cleanup must not touch the durable outbox')
})

beforeEach(() => {
  calls.length = 0
  jest.clearAllMocks()
  localStorage.clear()
})

it('disconnects producers and persistence before clearing session state and awaiting the disk purge', async () => {
  let finishPurge!: () => void
  const purging = new Promise<void>((resolve) => {
    finishPurge = resolve
  })
  let started!: () => void
  const startedPurge = new Promise<void>((resolve) => {
    started = resolve
  })
  jest.mocked(purgeCache).mockImplementationOnce(() => {
    calls.push('persistence.purge')
    started()
    return purging
  })
  let finished = false
  const cleanup = cleanupSession(() => true).then(() => {
    finished = true
  })
  await startedPurge

  expect(calls.slice(0, 4)).toEqual([
    'voiceConnection.disconnect',
    'dmCall.reset',
    'socket.disconnect',
    'persistence.stop'
  ])
  expect(calls.slice(-3)).toEqual(['cache.clear', 'structure.clear', 'persistence.purge'])
  expect(calls).toEqual(
    expect.arrayContaining([
      'message.clearMessages',
      'dm.clearMessages',
      'thread.closeThread',
      'forumReply.clearMessages',
      'forum.reset',
      'inbox.reset',
      'serverLayout.reset',
      'activity.reset'
    ])
  )
  expect(finished).toBe(false)
  finishPurge()
  await cleanup
  expect(finished).toBe(true)
})

it('clears transient account data, not durable drafts or the outbox', async () => {
  localStorage.setItem('account-drafts', '{"alice":"draft"}')
  localStorage.setItem('account-outbox', '{"alice":"queued"}')
  await cleanupSession(() => true)

  expect(useMemberStore.setState).toHaveBeenCalledWith(
    expect.objectContaining({
      members: [],
      onlineUserIds: new Set(),
      realtimeStatuses: new Map()
    })
  )
  expect(useDmStore.getState().clearMessages).toHaveBeenCalledTimes(1)
  expect(useDmStore.setState).toHaveBeenCalledWith(
    expect.objectContaining({
      conversations: [],
      conversationsError: null,
      currentConversationId: null,
      scrollToMessageId: null
    })
  )
  expect(useThreadStore.getState().closeThread).toHaveBeenCalledTimes(1)
  expect(useForumReplyStore.setState).toHaveBeenCalledWith({ channelId: null, postId: null, scrollRequestNonce: 0 })
  expect(useBookmarkStore.setState).toHaveBeenCalledWith({ bookmarkedIds: new Set(), loaded: false })
  expect(localStorage.getItem('account-drafts')).toBe('{"alice":"draft"}')
  expect(localStorage.getItem('account-outbox')).toBe('{"alice":"queued"}')
})

it('continues the real reset sequence and reports a failed reset', async () => {
  const cause = new Error('voice failed')
  jest.mocked(useVoiceConnectionStore.getState().disconnect).mockImplementationOnce(() => {
    throw cause
  })
  const result = cleanupSession(() => true)
  await expect(result).rejects.toMatchObject({
    errors: [expect.objectContaining({ message: 'Failed to clean up voice connection', cause })]
  })
  expect(calls).toContain('dmCall.reset')
  expect(calls).toContain('persistence.purge')
})

it.each([false, true])(
  'awaits asynchronous media teardown before realtime/cache cleanup (failure: %s)',
  async (fails) => {
    let finishVoice!: () => void
    let failVoice!: (error: Error) => void
    const voice = new Promise<void>((resolve, reject) => {
      finishVoice = resolve
      failVoice = reject
    })
    let started!: () => void
    const voiceStarted = new Promise<void>((resolve) => {
      started = resolve
    })
    jest.mocked(useVoiceConnectionStore.getState().disconnect).mockImplementationOnce(() => {
      calls.push('voiceConnection.disconnect')
      started()
      return voice
    })
    const cleanup = cleanupSession(() => true)
    const assertion = fails
      ? expect(cleanup).rejects.toMatchObject({
          errors: [expect.objectContaining({ message: 'Failed to clean up voice connection' })]
        })
      : expect(cleanup).resolves.toBeUndefined()
    await voiceStarted
    expect(calls).toEqual(['voiceConnection.disconnect'])
    if (fails) failVoice(new Error('media teardown failed'))
    else finishVoice()
    await assertion
    expect(calls).toContain('socket.disconnect')
    expect(calls).toContain('message.clearMessages')
    expect(calls).toContain('persistence.stop')
    expect(calls).toContain('persistence.purge')
  }
)

it('reports failed imports, sync resets, and async resets together, after trying all steps', async () => {
  const importError = new Error('import')
  const syncError = new Error('reset')
  const asyncError = new Error('purge')
  const finalReset = jest.fn()
  const steps: SessionCleanupStep[] = [
    { name: 'import', load: () => Promise.reject(importError) },
    {
      name: 'sync',
      load: async () => () => {
        throw syncError
      }
    },
    { name: 'async', load: async () => () => Promise.reject(asyncError) },
    { name: 'last', load: async () => finalReset }
  ]
  await expect(cleanupSession(() => true, steps)).rejects.toMatchObject({
    errors: [
      expect.objectContaining({ message: 'Failed to clean up import', cause: importError }),
      expect.objectContaining({ message: 'Failed to clean up sync', cause: syncError }),
      expect.objectContaining({ message: 'Failed to clean up async', cause: asyncError })
    ]
  })
  expect(finalReset).toHaveBeenCalledTimes(1)
})

it('does not run a delayed import or subsequent resets after the account changes', async () => {
  let isCurrent = true
  let finishImport!: (cleanup: () => void) => void
  const importing = new Promise<() => void>((resolve) => {
    finishImport = resolve
  })
  const staleReset = jest.fn()
  const nextImport = jest.fn()
  const cleanup = cleanupSession(
    () => isCurrent,
    [
      { name: 'delayed', load: () => importing },
      { name: 'next', load: nextImport }
    ]
  )
  isCurrent = false
  finishImport(staleReset)
  await cleanup
  expect(staleReset).not.toHaveBeenCalled()
  expect(nextImport).not.toHaveBeenCalled()
})

it('does not start another step after an asynchronous reset loses its session', async () => {
  let isCurrent = true
  const nextImport = jest.fn()
  await cleanupSession(
    () => isCurrent,
    [
      {
        name: 'first',
        load: async () => async () => {
          isCurrent = false
        }
      },
      { name: 'next', load: nextImport }
    ]
  )
  expect(nextImport).not.toHaveBeenCalled()
})
