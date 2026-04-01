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
})
