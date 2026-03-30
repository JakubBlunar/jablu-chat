import { useCallback, useState } from 'react'
import type { AdminMessage } from '../adminTypes'
import { adminFetch } from '../adminApi'
import { fmtDateTime } from '../adminFormatters'
import { Empty } from '../AdminShared'
import { Button } from '@/components/ui'

export function ModerationTab() {
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searched, setSearched] = useState(false)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const doSearch = useCallback(
    async (cursor?: string) => {
      const isFirst = !cursor
      if (isFirst) setLoading(true)
      else setLoadingMore(true)
      setError('')
      try {
        const params = new URLSearchParams()
        if (searchQuery.trim()) params.set('q', searchQuery.trim())
        if (cursor) params.set('cursor', cursor)
        params.set('limit', '50')
        const data = await adminFetch<{
          messages: AdminMessage[]
          nextCursor: string | null
        }>(`/api/admin/messages?${params}`)
        if (isFirst) setMessages(data.messages)
        else setMessages((prev) => [...prev, ...data.messages])
        setNextCursor(data.nextCursor)
        setSearched(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [searchQuery]
  )

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await adminFetch(`/api/admin/messages/${id}`, { method: 'DELETE' })
      setMessages((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void doSearch()
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search message content…"
          className="flex-1 rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="rounded-md bg-red-900/30 px-4 py-2 text-sm text-red-300 ring-1 ring-red-500/30">{error}</div>
      )}

      {!searched ? (
        <Empty>Enter a search term or click Search to browse recent messages.</Empty>
      ) : messages.length === 0 ? (
        <Empty>No messages found.</Empty>
      ) : (
        <div className="space-y-1">
          {messages.map((msg) => (
            <div key={msg.id} className="rounded-lg bg-surface-dark px-4 py-3 ring-1 ring-white/5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-white">
                      {msg.author?.displayName ?? msg.author?.username ?? 'Deleted User'}
                    </span>
                    {msg.channel && (
                      <>
                        <span className="text-gray-600">in</span>
                        <span className="text-gray-400">
                          #{msg.channel.name}
                          {msg.channel.server && <span className="text-gray-600"> ({msg.channel.server.name})</span>}
                        </span>
                      </>
                    )}
                    <time className="ml-auto shrink-0 text-xs text-gray-500">
                      {fmtDateTime(msg.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap break-all">
                    {msg.content ?? '[deleted]'}
                  </p>
                </div>
                <div className="shrink-0">
                  {confirmDeleteId === msg.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-red-400 ring-1 ring-red-500/30 hover:bg-red-900/30"
                        disabled={deletingId === msg.id}
                        onClick={() => void handleDelete(msg.id)}
                      >
                        {deletingId === msg.id ? '…' : 'Confirm'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-gray-400 hover:text-white"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="text-red-400 hover:bg-red-900/30"
                      onClick={() => setConfirmDeleteId(msg.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            disabled={loadingMore}
            onClick={() => void doSearch(nextCursor)}
          >
            {loadingMore ? 'Loading…' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  )
}
