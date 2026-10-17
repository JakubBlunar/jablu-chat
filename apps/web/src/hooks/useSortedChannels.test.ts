import { useSortedChannels } from './useSortedChannels'
import { renderHook } from '@testing-library/react'

function ch(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    name: 'general',
    type: 'text',
    position: 0,
    categoryId: null,
    isArchived: false,
    ...overrides
  } as any
}

function cat(overrides: Record<string, unknown> = {}) {
  return { id: 'cat-1', name: 'Info', position: 0, ...overrides } as any
}

describe('useSortedChannels', () => {
  it('separates text, voice, and forum channels', () => {
    const channels = [
      ch({ id: 't1', type: 'text' }),
      ch({ id: 'v1', type: 'voice' }),
      ch({ id: 'f1', type: 'forum' })
    ]
    const { result } = renderHook(() => useSortedChannels(channels))

    expect(result.current.textChannels.map((c: any) => c.id)).toEqual(['t1'])
    expect(result.current.voiceChannels.map((c: any) => c.id)).toEqual(['v1'])
    expect(result.current.forumChannels.map((c: any) => c.id)).toEqual(['f1'])
  })

  it('sorts by position', () => {
    const channels = [
      ch({ id: 't2', type: 'text', position: 2 }),
      ch({ id: 't1', type: 'text', position: 0 }),
      ch({ id: 't3', type: 'text', position: 1 })
    ]
    const { result } = renderHook(() => useSortedChannels(channels))
    expect(result.current.textChannels.map((c: any) => c.id)).toEqual(['t1', 't3', 't2'])
  })

  it('separates archived channels', () => {
    const channels = [
      ch({ id: 'active', isArchived: false }),
      ch({ id: 'archived', isArchived: true })
    ]
    const { result } = renderHook(() => useSortedChannels(channels))
    expect(result.current.textChannels.map((c: any) => c.id)).toEqual(['active'])
    expect(result.current.archivedChannels.map((c: any) => c.id)).toEqual(['archived'])
  })

  it('groups channels by category', () => {
    const channels = [
      ch({ id: 'uncat', categoryId: null }),
      ch({ id: 'in-cat', categoryId: 'cat-1' })
    ]
    const categories = [cat({ id: 'cat-1' })]
    const { result } = renderHook(() => useSortedChannels(channels, categories))

    expect(result.current.uncategorizedText.map((c: any) => c.id)).toEqual(['uncat'])
    expect(result.current.categoryGroups).toHaveLength(1)
    expect(result.current.categoryGroups[0].textChannels.map((c: any) => c.id)).toEqual(['in-cat'])
  })

  it('handles empty inputs', () => {
    const { result } = renderHook(() => useSortedChannels([]))
    expect(result.current.textChannels).toEqual([])
    expect(result.current.categoryGroups).toEqual([])
    expect(result.current.archivedChannels).toEqual([])
  })

  it('keeps stable order, empty categories, and channels with missing categories without mutating inputs', () => {
    const channels = [
      ch({ id: 't2', position: 2, categoryId: 'cat-1' }),
      ch({ id: 't1', position: 1, categoryId: 'cat-1' }),
      ch({ id: 'tie', position: 1, categoryId: 'cat-1' }),
      ch({ id: 'voice', type: 'voice', position: 0, categoryId: 'cat-1' }),
      ch({ id: 'forum', type: 'forum', categoryId: 'cat-1' }),
      ch({ id: 'orphan', categoryId: 'missing' }),
      ch({ id: 'uncat-voice', type: 'voice' }),
      ch({ id: 'uncat-forum', type: 'forum' }),
      ch({ id: 'archive2', position: 2, isArchived: true, categoryId: 'cat-1' }),
      ch({ id: 'archive1', position: 1, isArchived: true })
    ]
    const categories = [cat({ id: 'cat-1', position: 2 }), cat({ id: 'empty', position: 0 })]
    const originalChannels = [...channels]
    const originalCategories = [...categories]
    const { result } = renderHook(() => useSortedChannels(channels, categories))

    expect(result.current.categoryGroups.map((g) => g.category.id)).toEqual(['empty', 'cat-1'])
    expect(result.current.categoryGroups[0].textChannels).toEqual([])
    expect(result.current.categoryGroups[1].textChannels.map((c) => c.id)).toEqual(['t1', 'tie', 't2'])
    expect(result.current.categoryGroups[1].voiceChannels.map((c) => c.id)).toEqual(['voice'])
    expect(result.current.categoryGroups[1].forumChannels.map((c) => c.id)).toEqual(['forum'])
    expect(result.current.textChannels.map((c) => c.id)).toEqual(['orphan', 't1', 'tie', 't2'])
    expect(result.current.uncategorizedText).toEqual([])
    expect(result.current.uncategorizedVoice.map((c) => c.id)).toEqual(['uncat-voice'])
    expect(result.current.uncategorizedForum.map((c) => c.id)).toEqual(['uncat-forum'])
    expect(result.current.archivedChannels.map((c) => c.id)).toEqual(['archive1', 'archive2'])
    expect(channels).toEqual(originalChannels)
    expect(categories).toEqual(originalCategories)
  })

  it('reuses the result when categories are omitted and channel inputs have not changed', () => {
    const channels = [ch()]
    const { result, rerender } = renderHook(() => useSortedChannels(channels))
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('does not rescan channels for every category', () => {
    let categoryReads = 0
    const channels = Array.from({ length: 2000 }, (_, i) => ch({
      id: `ch-${i}`,
      type: (['text', 'voice', 'forum'] as const)[i % 3],
      position: 2000 - i
    }))
    for (let i = 0; i < channels.length; i++) {
      Object.defineProperty(channels[i], 'categoryId', {
        get: () => {
          categoryReads++
          return `cat-${i % 100}`
        }
      })
    }
    const categories = Array.from({ length: 100 }, (_, i) => cat({ id: `cat-${i}`, position: i }))
    const { result } = renderHook(() => useSortedChannels(channels, categories))

    const grouped = result.current.categoryGroups.flatMap((g) => [...g.textChannels, ...g.voiceChannels, ...g.forumChannels])
    expect(grouped).toHaveLength(channels.length)
    expect(categoryReads).toBeLessThanOrEqual(channels.length * 2)
  })
})
