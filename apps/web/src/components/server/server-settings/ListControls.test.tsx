import { act, renderHook } from '@testing-library/react'
import { useListPage } from '@/hooks/useListPage'

describe('settings list navigation', () => {
  const items = Array.from({ length: 23 }, (_, i) => i)

  it('starts a new search at page one instead of showing an empty later page', () => {
    const { result, rerender } = renderHook(({ values, query }) => useListPage(values, query), {
      initialProps: { values: items, query: '' }
    })
    act(() => result.current.onPageChange(3))
    expect(result.current.items).toEqual([20, 21, 22])
    rerender({ values: [21], query: '21' })
    expect(result.current.page).toBe(1)
    expect(result.current.items).toEqual([21])
  })

  it('moves back to a valid page when the last item is removed', () => {
    const { result, rerender } = renderHook(({ values }) => useListPage(values, ''), {
      initialProps: { values: items.slice(0, 11) }
    })
    act(() => result.current.onPageChange(2))
    rerender({ values: items.slice(0, 10) })
    expect(result.current.page).toBe(1)
    expect(result.current.items).toHaveLength(10)
    rerender({ values: [] })
    expect(result.current.page).toBe(1)
    expect(result.current.items).toEqual([])
  })

  it('resets the page when the number of rows changes', () => {
    const { result } = renderHook(() => useListPage(items, ''))
    act(() => result.current.onPageChange(3))
    act(() => result.current.onPageSizeChange(25))
    expect(result.current.page).toBe(1)
    expect(result.current.items).toHaveLength(23)
  })
})
