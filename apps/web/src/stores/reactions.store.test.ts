import { useReactionsStore, addRecentReaction, RECENT_SHOWN } from './reactions.store'

const DEFAULT_RECENT = ['👍', '❤️', '😂', '😮']

beforeEach(() => {
  useReactionsStore.setState({ recent: [...DEFAULT_RECENT] })
})

describe('reactions.store', () => {
  it('seeds with default native emojis', () => {
    expect(useReactionsStore.getState().recent).toEqual(DEFAULT_RECENT)
  })

  it('unshifts a newly used emoji to the front', () => {
    addRecentReaction('🔥')
    expect(useReactionsStore.getState().recent[0]).toBe('🔥')
  })

  it('dedupes: reusing an existing emoji moves it to the front without duplicating', () => {
    addRecentReaction('😂')
    const recent = useReactionsStore.getState().recent
    expect(recent[0]).toBe('😂')
    expect(recent.filter((e) => e === '😂')).toHaveLength(1)
  })

  it('caps the stored list at 20 entries', () => {
    for (let i = 0; i < 30; i++) addRecentReaction(`e${i}`)
    expect(useReactionsStore.getState().recent).toHaveLength(20)
  })

  it('ignores empty/whitespace emojis', () => {
    const before = useReactionsStore.getState().recent
    addRecentReaction('   ')
    expect(useReactionsStore.getState().recent).toEqual(before)
  })

  it('exposes at most RECENT_SHOWN via the shown slice', () => {
    addRecentReaction('🔥')
    addRecentReaction('🎉')
    const shown = useReactionsStore.getState().recent.slice(0, RECENT_SHOWN)
    expect(shown.length).toBeLessThanOrEqual(RECENT_SHOWN)
    expect(shown[0]).toBe('🎉')
  })
})
