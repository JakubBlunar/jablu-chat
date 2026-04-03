import { useForumStore } from './forum.store'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn()
  }
}))

jest.mock('./forumReply.store', () => ({
  useForumReplyStore: {
    getState: jest.fn().mockReturnValue({ clearMessages: jest.fn() })
  }
}))

import { api } from '@/lib/api'
import { useForumReplyStore } from './forumReply.store'
const mockGet = jest.mocked(api.get)
const mockPost = jest.mocked(api.post)
const mockClearMessages = jest.mocked(useForumReplyStore.getState().clearMessages)

function resetStore() {
  useForumStore.setState({
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

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('forum.store', () => {
  describe('init', () => {
    it('resets state and fetches posts for new channelId', () => {
      mockGet.mockResolvedValue({ posts: [], hasMore: false })

      useForumStore.getState().init('ch-forum')

      const state = useForumStore.getState()
      expect(state.channelId).toBe('ch-forum')
      expect(state.isLoading).toBe(true)
      expect(mockGet).toHaveBeenCalled()
    })

    it('no-ops when channelId is the same', () => {
      useForumStore.setState({ channelId: 'ch-forum' })

      useForumStore.getState().init('ch-forum')

      expect(mockGet).not.toHaveBeenCalled()
    })

    it('uses default layout and sort order', () => {
      mockGet.mockResolvedValue({ posts: [], hasMore: false })

      useForumStore.getState().init('ch-forum', 'grid', 'newest')

      const state = useForumStore.getState()
      expect(state.layout).toBe('grid')
      expect(state.sortOrder).toBe('newest')
    })
  })

  describe('fetchPosts', () => {
    it('passes sort order as query param', async () => {
      useForumStore.setState({ channelId: 'ch1', sortOrder: 'newest' })
      mockGet.mockResolvedValue({ posts: [{ id: 'p1' }], hasMore: true })

      await useForumStore.getState().fetchPosts()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('sort=newest'))
    })

    it('passes tagId when exactly one tag is active', async () => {
      useForumStore.setState({ channelId: 'ch1', activeTagIds: ['t1'] })
      mockGet.mockResolvedValue({ posts: [], hasMore: false })

      await useForumStore.getState().fetchPosts()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('tagId=t1'))
    })

    it('omits tagId when multiple tags are active', async () => {
      useForumStore.setState({ channelId: 'ch1', activeTagIds: ['t1', 't2'] })
      mockGet.mockResolvedValue({ posts: [], hasMore: false })

      await useForumStore.getState().fetchPosts()

      expect(mockGet).toHaveBeenCalledWith(expect.not.stringContaining('tagId='))
    })

    it('resets isLoading on error', async () => {
      useForumStore.setState({ channelId: 'ch1' })
      mockGet.mockRejectedValue(new Error('fail'))

      await useForumStore.getState().fetchPosts()

      expect(useForumStore.getState().isLoading).toBe(false)
    })
  })

  describe('fetchMore', () => {
    it('uses last post id as cursor', async () => {
      useForumStore.setState({
        channelId: 'ch1',
        posts: [{ id: 'p1' }, { id: 'p2' }] as any
      })
      mockGet.mockResolvedValue({ posts: [{ id: 'p3' }], hasMore: false })

      await useForumStore.getState().fetchMore()

      expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('cursor=p2'))
    })

    it('appends new posts', async () => {
      useForumStore.setState({
        channelId: 'ch1',
        posts: [{ id: 'p1' }] as any
      })
      mockGet.mockResolvedValue({ posts: [{ id: 'p2' }], hasMore: false })

      await useForumStore.getState().fetchMore()

      expect(useForumStore.getState().posts).toHaveLength(2)
    })

    it('does not fetch when already loading', async () => {
      useForumStore.setState({ channelId: 'ch1', isLoading: true, posts: [{ id: 'p1' }] as any })

      await useForumStore.getState().fetchMore()

      expect(mockGet).not.toHaveBeenCalled()
    })
  })

  describe('createPost', () => {
    it('adds the created post to the list', async () => {
      useForumStore.setState({ posts: [] })
      mockPost.mockResolvedValue({ id: 'new-post', title: 'Hello' })

      const post = await useForumStore.getState().createPost('ch1', 'Hello', 'content')

      expect(post.id).toBe('new-post')
      expect(useForumStore.getState().posts[0].id).toBe('new-post')
    })

    it('deduplicates if post already exists', async () => {
      useForumStore.setState({ posts: [{ id: 'new-post', title: 'Hello' }] as any })
      mockPost.mockResolvedValue({ id: 'new-post', title: 'Hello' })

      await useForumStore.getState().createPost('ch1', 'Hello', 'content')

      expect(useForumStore.getState().posts).toHaveLength(1)
    })
  })

  describe('openPost / closePost', () => {
    it('sets currentPostId and clears reply messages', () => {
      useForumStore.getState().openPost('p1')

      expect(useForumStore.getState().currentPostId).toBe('p1')
      expect(mockClearMessages).toHaveBeenCalled()
    })

    it('does not clear messages when opening same post', () => {
      useForumStore.setState({ currentPostId: 'p1' })

      useForumStore.getState().openPost('p1')

      expect(mockClearMessages).not.toHaveBeenCalled()
    })

    it('closes post', () => {
      useForumStore.setState({ currentPostId: 'p1' })

      useForumStore.getState().closePost()

      expect(useForumStore.getState().currentPostId).toBeNull()
    })
  })

  describe('addPost', () => {
    it('adds post to the front', () => {
      useForumStore.setState({ posts: [{ id: 'p1' }] as any })

      useForumStore.getState().addPost({ id: 'p2' } as any)

      expect(useForumStore.getState().posts[0].id).toBe('p2')
    })

    it('does not add duplicate', () => {
      useForumStore.setState({ posts: [{ id: 'p1' }] as any })

      useForumStore.getState().addPost({ id: 'p1' } as any)

      expect(useForumStore.getState().posts).toHaveLength(1)
    })
  })

  describe('removePost', () => {
    it('removes the post', () => {
      useForumStore.setState({ posts: [{ id: 'p1' }, { id: 'p2' }] as any })

      useForumStore.getState().removePost('p1')

      expect(useForumStore.getState().posts).toHaveLength(1)
      expect(useForumStore.getState().posts[0].id).toBe('p2')
    })

    it('clears currentPostId when removing the active post', () => {
      useForumStore.setState({ posts: [{ id: 'p1' }] as any, currentPostId: 'p1' })

      useForumStore.getState().removePost('p1')

      expect(useForumStore.getState().currentPostId).toBeNull()
    })
  })

  describe('toggleTag', () => {
    it('adds and removes tag from active list', () => {
      mockGet.mockResolvedValue({ posts: [], hasMore: false })

      useForumStore.setState({ channelId: 'ch1', activeTagIds: [] })
      useForumStore.getState().toggleTag('t1')
      expect(useForumStore.getState().activeTagIds).toContain('t1')

      useForumStore.getState().toggleTag('t1')
      expect(useForumStore.getState().activeTagIds).not.toContain('t1')
    })
  })
})
