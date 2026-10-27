import type { ForumPost, ForumTag, ForumLayout, ForumSortOrder } from '@chat/shared'
import { create } from 'zustand'
import { api } from '@/lib/api'
import { useForumReplyStore } from './forumReply.store'

interface ForumState {
  posts: ForumPost[]
  tags: ForumTag[]
  sortOrder: ForumSortOrder
  activeTagIds: string[]
  searchQuery: string
  layout: ForumLayout
  currentPostId: string | null
  isLoading: boolean
  hasMore: boolean
  nextCursor: string | null
  channelId: string | null

  init: (channelId: string, defaultLayout?: ForumLayout, defaultSortOrder?: ForumSortOrder) => void
  fetchPosts: () => Promise<void>
  fetchMore: () => Promise<void>
  fetchTags: (channelId: string) => Promise<void>
  createPost: (
    channelId: string,
    title: string,
    content?: string,
    tagIds?: string[],
    attachmentIds?: string[]
  ) => Promise<ForumPost>
  setSortOrder: (sort: ForumSortOrder) => void
  setLayout: (layout: ForumLayout) => void
  toggleTag: (tagId: string) => void
  clearTagFilters: () => void
  setSearchQuery: (query: string) => void
  openPost: (postId: string) => void
  closePost: () => void
  addPost: (post: ForumPost) => void
  updatePost: (post: ForumPost) => void
  /** Sync reply count from loaded thread or socket. Pass `lastActivityAt` only when known (e.g. `lastThreadReply.createdAt`). */
  updateReplyCount: (postId: string, replyCount: number, lastActivityAt?: string) => void
  removePost: (postId: string) => void
  reset: () => void
}

let pageRequest = 0

export const useForumStore = create<ForumState>((set, get) => ({
  posts: [],
  tags: [],
  sortOrder: 'latest_activity',
  activeTagIds: [],
  searchQuery: '',
  layout: 'list',
  currentPostId: null,
  isLoading: false,
  hasMore: false,
  nextCursor: null,
  channelId: null,

  init: (channelId, defaultLayout, defaultSortOrder) => {
    const prev = get()
    if (prev.channelId === channelId) return
    set({
      channelId,
      posts: [],
      tags: [],
      sortOrder: defaultSortOrder ?? 'latest_activity',
      activeTagIds: [],
      searchQuery: '',
      layout: defaultLayout ?? 'list',
      currentPostId: null,
      isLoading: true,
      hasMore: false,
      nextCursor: null
    })
    get().fetchTags(channelId)
    get().fetchPosts()
  },

  fetchPosts: async () => {
    const { channelId, sortOrder, activeTagIds } = get()
    if (!channelId) return
    const request = ++pageRequest
    set({ isLoading: true })
    try {
      const tagId = activeTagIds.length === 1 ? activeTagIds[0] : undefined
      const params = new URLSearchParams()
      params.set('sort', sortOrder)
      if (tagId) params.set('tagId', tagId)
      params.set('limit', '25')
      const result = await api.get<{ posts: ForumPost[]; hasMore: boolean; nextCursor?: string | null }>(
        `/api/channels/${channelId}/posts?${params}`
      )
      if (
        request !== pageRequest ||
        get().channelId !== channelId ||
        get().sortOrder !== sortOrder ||
        get().activeTagIds !== activeTagIds
      )
        return
      set({ posts: result.posts, hasMore: result.hasMore, nextCursor: result.nextCursor ?? null, isLoading: false })
    } catch {
      if (request !== pageRequest) return
      set({ isLoading: false })
    }
  },

  fetchMore: async () => {
    const { channelId, posts, isLoading, sortOrder, activeTagIds } = get()
    if (!channelId || isLoading || posts.length === 0) return
    const request = ++pageRequest
    set({ isLoading: true })
    const cursor = get().nextCursor ?? posts[posts.length - 1].id
    try {
      const tagId = activeTagIds.length === 1 ? activeTagIds[0] : undefined
      const params = new URLSearchParams()
      params.set('sort', sortOrder)
      if (tagId) params.set('tagId', tagId)
      params.set('cursor', cursor)
      params.set('limit', '25')
      const result = await api.get<{ posts: ForumPost[]; hasMore: boolean; nextCursor?: string | null }>(
        `/api/channels/${channelId}/posts?${params}`
      )
      if (
        request !== pageRequest ||
        get().channelId !== channelId ||
        get().sortOrder !== sortOrder ||
        get().activeTagIds !== activeTagIds
      )
        return
      set((s) => ({
        posts: [...s.posts, ...result.posts.filter((post) => !s.posts.some((existing) => existing.id === post.id))],
        hasMore: result.hasMore,
        nextCursor: result.nextCursor ?? null,
        isLoading: false
      }))
    } catch (error) {
      if (
        request !== pageRequest ||
        get().channelId !== channelId ||
        get().sortOrder !== sortOrder ||
        get().activeTagIds !== activeTagIds
      )
        return
      set({ isLoading: false })
      if ((error as { status?: number }).status === 409) await get().fetchPosts()
    }
  },

  fetchTags: async (channelId) => {
    try {
      const tags = await api.get<ForumTag[]>(`/api/channels/${channelId}/tags`)
      set({ tags })
    } catch {
      /* ignore */
    }
  },

  createPost: async (channelId, title, content, tagIds, attachmentIds) => {
    const post = await api.post<ForumPost>(`/api/channels/${channelId}/posts`, {
      title,
      content,
      tagIds,
      attachmentIds
    })
    set((s) => {
      if (s.posts.some((p) => p.id === post.id)) return s
      return { posts: [post, ...s.posts] }
    })
    return post
  },

  setSortOrder: (sort) => {
    set({ sortOrder: sort })
    get().fetchPosts()
  },

  setLayout: (layout) => set({ layout }),

  toggleTag: (tagId) => {
    set((s) => {
      const active = s.activeTagIds.includes(tagId)
        ? s.activeTagIds.filter((id) => id !== tagId)
        : [...s.activeTagIds, tagId]
      return { activeTagIds: active }
    })
    get().fetchPosts()
  },

  clearTagFilters: () => {
    set({ activeTagIds: [] })
    get().fetchPosts()
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  openPost: (postId) => {
    const { currentPostId } = get()
    if (currentPostId !== postId) {
      useForumReplyStore.getState().clearMessages()
    }
    set({ currentPostId: postId })
  },

  closePost: () => {
    useForumReplyStore.getState().clearMessages()
    set({ currentPostId: null })
  },

  addPost: (post) => {
    set((s) => {
      if (s.posts.some((p) => p.id === post.id)) return s
      return { posts: [post, ...s.posts] }
    })
  },

  updatePost: (post) => {
    set((s) => ({
      posts: s.posts.map((p) => (p.id === post.id ? post : p))
    }))
  },

  updateReplyCount: (postId, replyCount, lastActivityAt) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, replyCount, ...(lastActivityAt !== undefined ? { lastActivityAt } : {}) } : p
      )
    }))
  },

  removePost: (postId) => {
    set((s) => ({
      posts: s.posts.filter((p) => p.id !== postId),
      currentPostId: s.currentPostId === postId ? null : s.currentPostId
    }))
  },

  reset: () => {
    pageRequest++
    set({
      posts: [],
      tags: [],
      sortOrder: 'latest_activity',
      activeTagIds: [],
      searchQuery: '',
      layout: 'list',
      currentPostId: null,
      isLoading: false,
      hasMore: false,
      nextCursor: null,
      channelId: null
    })
  }
}))
