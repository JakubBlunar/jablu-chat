import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type SearchResult } from '@/lib/api'
export type Scope = 'server' | 'channel' | 'conversation' | 'dm' | 'all'
export function useMessageSearch({
  query,
  onQueryChange,
  defaultScope = 'server',
  currentServerId,
  currentChannelId,
  conversationId
}: {
  query: string
  onQueryChange: (value: string) => void
  defaultScope?: Scope
  currentServerId: string | null
  currentChannelId: string | null
  conversationId?: string
}) {
  const [scope, setScope] = useState<Scope>(defaultScope)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message?: string } | null>(null)
  const [localQuery, setLocalQuery] = useState(query)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const cancelDebounce = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
  const requestId = useRef(0)
  const searchController = useRef<AbortController | null>(null)
  useEffect(() => {
    setLocalQuery(query)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [query])
  const doSearch = useCallback(
    async (q: string, s: Scope, off: number) => {
      const request = ++requestId.current
      searchController.current?.abort()
      const controller = new AbortController()
      searchController.current = controller
      setError(null)
      if (!q.trim()) {
        setResults([])
        setTotal(0)
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const opts: Parameters<typeof api.searchMessages>[1] = { offset: off }
        if (s === 'server' && currentServerId) opts.serverId = currentServerId
        else if (s === 'channel' && currentChannelId) opts.channelId = currentChannelId
        else if (s === 'conversation' && conversationId) opts.conversationId = conversationId
        else if (s === 'dm') opts.dmOnly = true
        const data = await api.searchMessages(q, opts, { signal: controller.signal })
        if (request !== requestId.current) return
        setResults(data.results)
        setTotal(data.total)
      } catch (error) {
        if (request !== requestId.current) return
        setResults([])
        setTotal(0)
        setError({ message: error instanceof ApiError ? error.message : undefined })
      } finally {
        if (request === requestId.current) setLoading(false)
      }
    },
    [currentServerId, currentChannelId, conversationId]
  )
  useEffect(() => {
    const requests = requestId
    void doSearch(query, scope, offset)
    return () => {
      requests.current++
      searchController.current?.abort()
    }
  }, [query, scope, offset, doSearch])
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )
  function submit(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setLocalQuery(value)
    setOffset(0)
    if (value === query && offset === 0) void doSearch(value, scope, 0)
    else onQueryChange(value)
  }
  function handleLocalChange(value: string) {
    requestId.current++
    searchController.current?.abort()
    setLoading(false)
    setLocalQuery(value)
    setError(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.trim()) {
      timerRef.current = setTimeout(() => {
        submit(value)
      }, 400)
    } else {
      setOffset(0)
      onQueryChange('')
      setResults([])
      setTotal(0)
      setLoading(false)
    }
  }
  function handleScopeChange(s: Scope) {
    setScope(s)
    setOffset(0)
  }
  return {
    scope,
    results,
    total,
    offset,
    setOffset,
    loading,
    error,
    localQuery,
    doSearch,
    submit,
    handleLocalChange,
    handleScopeChange,
    cancelDebounce
  }
}
