import { useBookmarkStore } from './bookmark.store'

jest.mock('@/lib/api', () => ({
  api: {
    getBookmarkIds: jest.fn(),
    toggleBookmark: jest.fn(),
    removeBookmark: jest.fn()
  }
}))

import { api } from '@/lib/api'

function resetStore() {
  useBookmarkStore.setState({ bookmarkedIds: new Set(), loaded: false })
}

beforeEach(() => {
  resetStore()
  jest.clearAllMocks()
})

describe('bookmark.store', () => {
  describe('fetchIds', () => {
    it('loads bookmark IDs into a Set', async () => {
      jest.mocked(api.getBookmarkIds).mockResolvedValueOnce(['m1', 'm2'])
      await useBookmarkStore.getState().fetchIds()

      expect(useBookmarkStore.getState().bookmarkedIds.has('m1')).toBe(true)
      expect(useBookmarkStore.getState().bookmarkedIds.has('m2')).toBe(true)
      expect(useBookmarkStore.getState().loaded).toBe(true)
    })

    it('sets loaded true even on error', async () => {
      jest.mocked(api.getBookmarkIds).mockRejectedValueOnce(new Error('fail'))
      await useBookmarkStore.getState().fetchIds()
      expect(useBookmarkStore.getState().loaded).toBe(true)
    })
  })

  describe('toggleBookmark', () => {
    it('adds message id on "added"', async () => {
      jest.mocked(api.toggleBookmark).mockResolvedValueOnce({ action: 'added', messageId: 'm1' })
      await useBookmarkStore.getState().toggleBookmark('m1')
      expect(useBookmarkStore.getState().bookmarkedIds.has('m1')).toBe(true)
    })

    it('removes message id on "removed"', async () => {
      useBookmarkStore.setState({ bookmarkedIds: new Set(['m1']) })
      jest.mocked(api.toggleBookmark).mockResolvedValueOnce({ action: 'removed', messageId: 'm1' })
      await useBookmarkStore.getState().toggleBookmark('m1')
      expect(useBookmarkStore.getState().bookmarkedIds.has('m1')).toBe(false)
    })
  })

  describe('removeBookmark', () => {
    it('removes the message id', async () => {
      useBookmarkStore.setState({ bookmarkedIds: new Set(['m1', 'm2']) })
      jest.mocked(api.removeBookmark).mockResolvedValueOnce(undefined)
      await useBookmarkStore.getState().removeBookmark('m1')
      expect(useBookmarkStore.getState().bookmarkedIds.has('m1')).toBe(false)
      expect(useBookmarkStore.getState().bookmarkedIds.has('m2')).toBe(true)
    })
  })

  describe('isBookmarked', () => {
    it('returns true for bookmarked, false otherwise', () => {
      useBookmarkStore.setState({ bookmarkedIds: new Set(['m1']) })
      expect(useBookmarkStore.getState().isBookmarked('m1')).toBe(true)
      expect(useBookmarkStore.getState().isBookmarked('m999')).toBe(false)
    })
  })
})
