import { useEffect, useState } from 'react'
export type ContentPage<T> = { items: T[]; total: number }
export function usePagedContent<T>(loadPage: (page: number, limit: number) => Promise<ContentPage<T>>, pageSize = 30) {
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ items: T[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    void loadPage(page, pageSize).then(
      (result) => {
        if (cancelled) return
        if (page > 0 && result.items.length === 0 && result.total <= page * pageSize) {
          setPage(Math.max(0, Math.ceil(result.total / pageSize) - 1))
        } else {
          setData(result)
          setLoading(false)
        }
      },
      () => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [loadPage, page, attempt, pageSize])
  return {
    page,
    data,
    loading,
    error,
    retry: () => setAttempt((n) => n + 1),
    previous: () => setPage((n) => Math.max(0, n - 1)),
    next: () => setPage((n) => n + 1)
  }
}
