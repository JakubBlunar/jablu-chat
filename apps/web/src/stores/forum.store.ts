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
  channelId: string | null

  init: (channelId: string, defaultLayout?: ForumLayout, defaultSortOrder?: ForumSortOrder) => void
  fetchPosts: () => Promise<void>
  fetchMore: () => Promise<void>
  fetchTags: (channelId: string) => Promise<void>
  createPost: (channelId: string, title: string, content?: string, tagIds?: string[], attachmentIds?: string[]) => Promise<ForumPost>
  setSortOrder: (sort: ForumSortOrder) => void
  setLayout: (layout: ForumLayout) => void
  toggleTag: (tagId: string) => void
  clearTagFilters: () => void
  setSearchQuery: (query: string) => void
  openPost: (postId: string) => void
  closePost: () => void
  addPost: (post: ForumPost) => void
  updatePost: (post: ForumPost) => void
  updateReplyCount: (postId: string, replyCount: number) => void
  removePost: (postId: string) => void
  reset: () => void
}

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
      hasMore: false
    })
    get().fetchTags(channelId)
    get().fetchPosts()
  },

  fetchPosts: async () => {
    const { channelId, sortOrder, activeTagIds } = get()
    if (!channelId) return
    set({ isLoading: true })
    try {
      const tagId = activeTagIds.length === 1 ? activeTagIds[0] : undefined
      const params = new URLSearchParams()
      params.set('sort', sortOrder)
      if (tagId) params.set('tagId', tagId)
      params.set('limit', '25')
      const result = await api.get<{ posts: ForumPost[]; hasMore: boolean }>(
        `/api/channels/${channelId}/posts?${params}`
      )
      set({ posts: result.posts, hasMore: result.hasMore, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  fetchMore: async () => {
    const { channelId, posts, isLoading, sortOrder, activeTagIds } = get()
    if (!channelId || isLoading || posts.length === 0) return
    set({ isLoading: true })
    const cursor = posts[posts.length - 1].id
    try {
      const tagId = activeTagIds.length === 1 ? activeTagIds[0] : undefined
      const params = new URLSearchParams()
      params.set('sort', sortOrder)
      if (tagId) params.set('tagId', tagId)
      params.set('cursor', cursor)
      params.set('limit', '25')
      const result = await api.get<{ posts: ForumPost[]; hasMore: boolean }>(
        `/api/channels/${channelId}/posts?${params}`
      )
      set((s) => ({
        posts: [...s.posts, ...result.posts],
        hasMore: result.hasMore,
        isLoading: false
      }))
    } catch {
      set({ isLoading: false })
    }
  },

  fetchTags: async (channelId) => {
    try {
      const tags = await api.get<ForumTag[]>(`/api/channels/${channelId}/tags`)
      set({ tags })
    } catch { /* ignore */ }
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

  updateReplyCount: (postId, replyCount) => {
    set((s) => ({
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, replyCount, lastActivityAt: new Date().toISOString() } : p
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
      channelId: null
    })
  }
}))
