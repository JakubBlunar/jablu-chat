import { create } from 'zustand'
import { registerConversationCoordinator } from '@/lib/conversationNavigation'
import type { Channel, ForumPost } from '@chat/shared'
import { api } from '@/lib/api'
import {
  conversationPath,
  type ConversationRequest,
  type ConversationTarget,
  type ConversationOutcome
} from '@/lib/conversationTarget'
import { hydrateContextFromDisk } from '@/lib/cache/hydrate'
import { channelKey, dmKey, peekContext } from '@/lib/cache/messageCache'
import { historyErrorKey, requireMessageTarget, type HistoryErrorKey } from '@/lib/messageHistory'
import { getSocket } from '@/lib/socket'
import { useChannelPermissionsStore } from './channel-permissions.store'
import { useChannelStore } from './channel.store'
import { useDmStore } from './dm.store'
import { useEmojiStore } from './emoji.store'
import { useForumStore } from './forum.store'
import { useForumReplyStore } from './forumReply.store'
import { useInboxStore } from './inbox.store'
import { useLayoutStore } from './layout.store'
import { useMemberStore } from './member.store'
import { useMessageStore } from './message.store'
import { useNavHistoryStore } from './navHistory.store'
import { useReadStateStore } from './readState.store'
import { useServerStore } from './server.store'
import { useThreadStore } from './thread.store'
import { useVoiceConnectionStore } from './voice-connection.store'

type Router = (path: string, options?: { replace?: boolean; state?: unknown }) => void
export interface ConversationRoute {
  key: string
  requestId?: number
  consumedId?: number
  isCurrent: () => boolean
}
type RouteOutcome = ConversationOutcome | { status: 'redirected' }
type Status = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'error'
interface NavigationState {
  status: Status
  request: ConversationRequest | null
  routeKey: string | null
  isNavigating: boolean
  navigatingToServerId: string | null
  activeNavId: number
  error: { key: HistoryErrorKey; retry: () => Promise<ConversationOutcome> } | null
  openConversation: (request: ConversationRequest, options?: { replace?: boolean }) => Promise<ConversationOutcome>
  enterRoute: (request: ConversationRequest, route: ConversationRoute) => Promise<RouteOutcome>
  bindRouter: (router: Router | null) => void
  dismissError: () => void
  cancelNavigation: () => void
  reset: () => void
}

let counter = 0
let router: Router | null = null
let pending: {
  id: number
  request: ConversationRequest
  replace?: boolean
  dispatched: boolean
  resolve: (result: ConversationOutcome) => void
} | null = null
let work: { id: number; key: string; controller: AbortController; promise: Promise<RouteOutcome> } | null = null
let handoffId: number | null = null

function abortWork() {
  work?.controller.abort()
  work = null
  // Generation guards also protect against transports which ignore abort.
  useMessageStore.getState().cancelPendingFetch()
  useDmStore.getState().cancelPendingFetch()
  useThreadStore.getState().cancelPendingFetch()
  useForumReplyStore.getState().cancelPendingFetch()
}

function finishPending(id: number, outcome: ConversationOutcome) {
  if (pending?.id !== id) return
  const resolve = pending.resolve
  pending = null
  resolve(outcome)
}

/** Selection is a mirror of a committed Router URL, never a preload side effect. */
function selectRoute(target: ConversationTarget) {
  const server = useServerStore.getState()
  const channel = useChannelStore.getState()
  const dm = useDmStore.getState()
  const changed =
    target.kind === 'dm' || target.kind === 'home'
      ? server.viewMode !== 'dm' || dm.currentConversationId !== (target.kind === 'dm' ? target.conversationId : null)
      : server.viewMode !== 'server' ||
        server.currentServerId !== target.serverId ||
        channel.currentChannelId !== (target.kind === 'channel' ? target.channelId : null)
  if (changed) {
    useMessageStore.getState().stashCurrent()
    useDmStore.getState().stashCurrent()
    useThreadStore.getState().closeThread()
    useForumStore.getState().closePost()
  }
  useLayoutStore.getState().closeNavDrawer()
  if (target.kind === 'home' || target.kind === 'dm') {
    server.setViewMode('dm')
    const conversationId = target.kind === 'dm' ? target.conversationId : null
    dm.setCurrentConversation(conversationId)
    useNavHistoryStore.getState().recordDmScreen(conversationId)
    const voice = useVoiceConnectionStore.getState()
    voice.setViewingVoiceRoom(!!voice.currentDmCallId && conversationId === voice.currentChannelId)
  } else {
    server.setCurrentServer(target.serverId)
    channel.setCurrentChannel(target.kind === 'channel' ? target.channelId : null)
    const voice = useVoiceConnectionStore.getState()
    voice.setViewingVoiceRoom(target.kind === 'channel' && target.channelId === voice.currentChannelId)
  }
}

async function serverChannels(serverId: string, requested: string | undefined, current: () => boolean) {
  const state = useChannelStore.getState()
  const missing =
    !!requested && !state.channels.some((channel) => channel.id === requested && channel.serverId === serverId)
  if (state.loadedServerId !== serverId || missing) {
    void useMemberStore
      .getState()
      .fetchMembers(serverId)
      .catch(() => {})
    void useEmojiStore
      .getState()
      .fetch(serverId)
      .catch(() => {})
    const cached =
      !missing && state.hydrateFromCache(serverId) && useChannelPermissionsStore.getState().hydrateFromCache(serverId)
    const refresh = Promise.all([
      state.fetchChannels(serverId),
      useChannelPermissionsStore.getState().fetchChannelPermissions(serverId)
    ])
    if (cached) void refresh.catch(() => {})
    else await refresh
  } else if (useChannelPermissionsStore.getState().requestedServerId !== serverId) {
    await useChannelPermissionsStore.getState().fetchChannelPermissions(serverId)
  }
  return current() ? useChannelStore.getState().channels.filter((channel) => channel.serverId === serverId) : []
}

function landingChannel(serverId: string, channels: Channel[]) {
  const remembered = useNavHistoryStore.getState().getLastChannel(serverId)
  return (
    channels.find((channel) => channel.id === remembered && (channel.type === 'text' || channel.type === 'forum')) ??
    channels
      .filter((channel) => channel.type === 'text' && !channel.isArchived)
      .sort((a, b) => a.position - b.position)[0]
  )
}

async function loadHistory(request: ConversationRequest, signal: AbortSignal, current: () => boolean) {
  const target = request.target
  if (target.kind !== 'channel' && target.kind !== 'dm') return false
  const dm = target.kind === 'dm'
  const id = dm ? target.conversationId : target.channelId
  const store = () => (dm ? useDmStore.getState() : useMessageStore.getState())
  const loaded = () => (dm ? useDmStore.getState().loadedForConvId : useMessageStore.getState().loadedForChannelId)
  // A cached window is reusable; an error/position from its previous request is not.
  if (dm) useDmStore.setState({ messagesError: null })
  else useMessageStore.setState({ messagesError: null })
  const position = request.position ?? { kind: 'unread' }
  const read = useReadStateStore.getState()
  const unread =
    (dm ? read.dmViewSnapshots : read.channelViewSnapshots).get(id) ?? (dm ? read.dms : read.channels).get(id)
  const anchor =
    position.kind === 'message'
      ? (position.threadParentId ?? position.messageId)
      : position.kind === 'thread'
        ? position.parentId
        : position.kind === 'latest'
          ? position.threadParentId
          : position.kind === 'unread' && unread?.unreadCount
            ? unread.firstUnreadMessageId
            : null
  if (!anchor) store().setScrollToMessageId(null)
  if (anchor) {
    if (loaded() !== id) {
      const key = dm ? dmKey(id) : channelKey(id)
      await hydrateContextFromDisk(key)
      if (!current()) return false
      const stale = peekContext(key)?.stale ?? false
      if (store().hydrateFromCache(id) && stale) void store().revalidate(id)
    }
    if (loaded() !== id || !store().messages.some((message) => message.id === anchor)) {
      await store().fetchMessagesAround(id, anchor, signal)
    }
    if (!current()) return false
    if (store().messagesError) throw new Error(store().messagesError!)
    requireMessageTarget(store().messages, anchor)
    useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
    store().setScrollToMessageId(anchor)
  } else if (loaded() !== id || store().hasNewer) {
    const key = dm ? dmKey(id) : channelKey(id)
    await hydrateContextFromDisk(key)
    if (!current()) return false
    const stale = peekContext(key)?.stale ?? false
    const served = store().hydrateFromCache(id)
    if (served && stale) void store().revalidate(id)
    if (!served) await store().fetchMessages(id, undefined, signal)
    if (!current()) return false
    if (store().messagesError) throw new Error(store().messagesError!)
  }
  return store().messages.length === 0
}

async function positionReplies(
  request: ConversationRequest,
  channel: Channel,
  signal: AbortSignal,
  current: () => boolean
) {
  const position = request.position
  if (
    !position ||
    (position.kind !== 'message' &&
      position.kind !== 'thread' &&
      !(position.kind === 'latest' && position.threadParentId))
  ) {
    if (channel.type === 'forum') useForumStore.getState().closePost()
    else useThreadStore.getState().closeThread()
    return
  }
  const messageId = position.kind === 'message' ? position.messageId : null
  const parentId =
    position.kind === 'thread'
      ? position.parentId
      : position.kind === 'message' || position.kind === 'latest'
        ? position.threadParentId
        : undefined
  if (channel.type === 'forum') {
    const postId = parentId ?? messageId!
    const forum = useForumStore.getState()
    forum.init(channel.id, channel.defaultLayout, channel.defaultSortOrder)
    if (!useForumStore.getState().posts.some((post) => post.id === postId)) {
      const post = await api.get<ForumPost>('/api/channels/' + channel.id + '/posts/' + encodeURIComponent(postId), {
        signal
      })
      if (!current()) return
      useForumStore.getState().addPost(post)
    }
    useForumStore.getState().openPost(postId)
    useForumReplyStore.setState({ messagesError: null })
    const replies = useForumReplyStore.getState()
    const focus = parentId && messageId && messageId !== postId ? messageId : null
    useForumReplyStore.setState({ channelId: channel.id, postId, focusMessageId: focus })
    if (
      replies.loadedForPostId !== postId ||
      (focus && !replies.messages.some((message) => message.id === focus)) ||
      (position.kind === 'latest' && replies.hasNewer)
    ) {
      await useForumReplyStore.getState().fetchMessages(signal)
    }
    if (!current()) return
    const ready = useForumReplyStore.getState()
    if (ready.messagesError) throw new Error(ready.messagesError)
    ready.setScrollToMessageId(focus ?? null)
  } else if (!parentId) {
    useThreadStore.getState().closeThread()
  } else {
    const parent = useMessageStore.getState().messages.find((message) => message.id === parentId)
    if (!parent) throw new Error('messageUnavailable')
    const focus = messageId && messageId !== parentId ? messageId : undefined
    useThreadStore.setState({ messagesError: null, focusMessageId: focus ?? null })
    useThreadStore.getState().openThread(channel.id, parent, focus ? { focusMessageId: focus } : undefined)
    const thread = useThreadStore.getState()
    if (
      thread.loadedForParentId !== parentId ||
      (focus && !thread.messages.some((message) => message.id === focus)) ||
      (position.kind === 'latest' && thread.hasNewer)
    ) {
      if (position.kind === 'latest') useThreadStore.setState({ focusMessageId: null })
      await thread.fetchMessages(signal)
    }
    if (!current()) return
    const ready = useThreadStore.getState()
    if (ready.messagesError) throw new Error(ready.messagesError)
    ready.setScrollToMessageId(focus ?? null)
  }
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  status: 'idle',
  request: null,
  routeKey: null,
  isNavigating: false,
  navigatingToServerId: null,
  activeNavId: 0,
  error: null,
  bindRouter: (next) => {
    router = next
    if (router && pending && !pending.dispatched) {
      pending.dispatched = true
      router(conversationPath(pending.request), {
        replace: pending.replace,
        state: { conversationRequestId: pending.id }
      })
    }
  },
  cancelNavigation: () => {
    abortWork()
    if (pending) finishPending(pending.id, { status: 'cancelled' })
    handoffId = null
    set({ activeNavId: ++counter, status: 'idle', isNavigating: false, navigatingToServerId: null, error: null })
  },
  reset: () => {
    get().cancelNavigation()
    set({ request: null, routeKey: null })
  },
  dismissError: () => {
    const request = get().request
    set({ error: null })
    if (request) void get().openConversation({ ...request, position: { kind: 'latest' } }, { replace: true })
  },
  openConversation: (request, options) => {
    get().cancelNavigation()
    const id = ++counter
    set({
      activeNavId: id,
      request,
      status: 'loading',
      isNavigating: true,
      error: null,
      navigatingToServerId:
        request.target.kind === 'channel' || request.target.kind === 'server' ? request.target.serverId : null
    })
    return new Promise((resolve) => {
      pending = { id, request, resolve, replace: options?.replace, dispatched: !!router }
      router?.(conversationPath(request), { replace: options?.replace, state: { conversationRequestId: id } })
    })
  },
  enterRoute: (request, route) => {
    if (!route.isCurrent()) return Promise.resolve({ status: 'cancelled' })
    if (work?.key === route.key) return work.promise
    if (
      route.consumedId === get().activeNavId &&
      get().status !== 'loading' &&
      get().request &&
      conversationPath(get().request!, false) === conversationPath(request, false)
    ) {
      set({ routeKey: route.key })
      return Promise.resolve({
        status: 'opened',
        path: conversationPath(request, false),
        target: request.target,
        empty: get().status === 'empty'
      })
    }
    const handedOff = route.requestId != null && (route.requestId === pending?.id || route.requestId === handoffId)
    if (!handedOff) get().cancelNavigation()
    else abortWork()
    const id = handedOff ? route.requestId! : ++counter
    // Carry non-URL intent (latest, source) through the committed Router entry.
    if (pending?.id === id) request = { ...pending.request, target: request.target, search: request.search }
    const controller = new AbortController()
    const current = () => !controller.signal.aborted && get().activeNavId === id && route.isCurrent()
    set({
      activeNavId: id,
      request,
      routeKey: route.key,
      status: 'loading',
      isNavigating: true,
      error: null,
      navigatingToServerId:
        request.target.kind === 'channel' || request.target.kind === 'server' ? request.target.serverId : null
    })
    selectRoute(request.target)
    const entry = { id, key: route.key, controller, promise: Promise.resolve<RouteOutcome>({ status: 'cancelled' }) }
    work = entry
    const run = async (): Promise<RouteOutcome> => {
      try {
        let empty = false
        const target = request.target
        if (target.kind === 'server' || target.kind === 'channel') {
          const channels = await serverChannels(
            target.serverId,
            target.kind === 'channel' ? target.channelId : undefined,
            current
          )
          if (!current()) return { status: 'cancelled' }
          if (target.kind === 'server') {
            const landing = landingChannel(target.serverId, channels)
            if (landing) {
              const destination = {
                ...request,
                target: { kind: 'channel' as const, serverId: target.serverId, channelId: landing.id }
              }
              handoffId = id
              work = null
              router?.(conversationPath(destination), { replace: true, state: { conversationRequestId: id } })
              return { status: 'redirected' }
            }
            empty = true
          } else {
            const channel = channels.find((item) => item.id === target.channelId)
            if (!channel) throw new Error('messageUnavailable')
            if (channel.type === 'text') empty = await loadHistory(request, controller.signal, current)
            if (!current()) return { status: 'cancelled' }
            await positionReplies(request, channel, controller.signal, current)
            if (!current()) return { status: 'cancelled' }
            if (channel.type === 'text' || channel.type === 'forum')
              useNavHistoryStore.getState().recordChannel(target.serverId, target.channelId)
            useNavHistoryStore
              .getState()
              .recordServerLocation(target.serverId, channel.type === 'voice' ? null : channel.id)
            getSocket()?.emit('channel:join', { channelId: channel.id })
          }
        } else if (target.kind === 'dm') {
          empty = await loadHistory(request, controller.signal, current)
          if (!current()) return { status: 'cancelled' }
          getSocket()?.emit('dm:join', { conversationId: target.conversationId })
        } else empty = true
        if (!current()) return { status: 'cancelled' }
        const position = request.position
        if (position?.kind === 'message' && (target.kind === 'channel' || target.kind === 'dm')) {
          useInboxStore
            .getState()
            .confirmNavigation(
              target.kind,
              target.kind === 'dm' ? target.conversationId : target.channelId,
              position.messageId,
              position.threadParentId ?? null
            )
        }
        set({ status: empty ? 'empty' : 'ready', isNavigating: false, navigatingToServerId: null })
        const outcome: ConversationOutcome = { status: 'opened', path: conversationPath(request, false), target, empty }
        finishPending(id, outcome)
        return outcome
      } catch (error) {
        if (!current()) return { status: 'cancelled' }
        const key = historyErrorKey(error)
        const outcome: ConversationOutcome =
          key === 'messageUnavailable' ? { status: 'unavailable', key } : { status: 'error', key }
        set({
          status: outcome.status,
          isNavigating: false,
          navigatingToServerId: null,
          error: { key, retry: () => get().openConversation(request, { replace: true }) }
        })
        finishPending(id, outcome)
        return outcome
      }
    }
    let timeout: ReturnType<typeof setTimeout>
    const interrupted = new Promise<RouteOutcome>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })
      timeout = setTimeout(() => {
        if (!current()) return
        const outcome: ConversationOutcome = { status: 'error', key: 'historyLoadFailed' }
        set({
          status: 'error',
          isNavigating: false,
          navigatingToServerId: null,
          error: { key: 'historyLoadFailed', retry: () => get().openConversation(request, { replace: true }) }
        })
        finishPending(id, outcome)
        resolve(outcome)
        abortWork()
      }, 15_000)
    })
    entry.promise = Promise.race([run(), interrupted]).finally(() => clearTimeout(timeout))
    return entry.promise
  }
}))

registerConversationCoordinator(
  (request, options) => useNavigationStore.getState().openConversation(request, options),
  (router) => useNavigationStore.getState().bindRouter(router)
)
