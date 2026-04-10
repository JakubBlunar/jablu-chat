import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@chat/shared'
import SimpleBar from 'simplebar-react'
import { UserAvatar } from '@/components/UserAvatar'
import { api, type SearchResult } from '@/lib/api'
import { formatSmartTimestamp } from '@/lib/format-time'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { IconButton, Spinner } from '@/components/ui'

type Scope = 'server' | 'channel' | 'conversation' | 'dm' | 'all'
const PAGE_SIZE = 25

type Props = {
  query: string
  onQueryChange: (q: string) => void
  onClose: () => void
  defaultScope?: Scope
  conversationId?: string
}

export function SearchDrawer({ query, onQueryChange, onClose, defaultScope = 'server', conversationId }: Props) {
  const { t } = useTranslation('search')
  const { t: tNav } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const channels = useChannelStore((s) => s.channels)
  const currentChannel = channels.find((c) => c.id === currentChannelId)
  const { orchestratedGoToChannel, orchestratedGoToDm } = useAppNavigate()

  const [scope, setScope] = useState<Scope>(defaultScope)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localQuery, setLocalQuery] = useState(query)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalQuery(query)
  }, [query])

  const doSearch = useCallback(
    async (q: string, s: Scope, off: number) => {
      if (!q.trim()) {
        setResults([])
        setTotal(0)
        return
      }
      setLoading(true)
      setError(false)
      try {
        const opts: Parameters<typeof api.searchMessages>[1] = { offset: off }
        if (s === 'server' && currentServerId) opts.serverId = currentServerId
        else if (s === 'channel' && currentChannelId) opts.channelId = currentChannelId
        else if (s === 'conversation' && conversationId) opts.conversationId = conversationId
        else if (s === 'dm') opts.dmOnly = true
        const data = await api.searchMessages(q, opts)
        setResults(data.results)
        setTotal(data.total)
      } catch {
        setResults([])
        setTotal(0)
        setError(true)
      } finally {
        setLoading(false)
      }
    },
    [currentServerId, currentChannelId, conversationId]
  )

  useEffect(() => {
    if (query.trim()) {
      void doSearch(query, scope, offset)
    }
  }, [query, scope, offset, doSearch])

  function handleLocalChange(value: string) {
    setLocalQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (value.trim()) {
      timerRef.current = setTimeout(() => {
        setOffset(0)
        onQueryChange(value)
      }, 400)
    } else {
      setOffset(0)
      onQueryChange('')
      setResults([])
      setTotal(0)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && localQuery.trim()) {
      if (timerRef.current) clearTimeout(timerRef.current)
      setOffset(0)
      onQueryChange(localQuery)
    }
    if (e.key === 'Escape') onClose()
  }

  function handleScopeChange(s: Scope) {
    setScope(s)
    setOffset(0)
  }

  function handleResultClick(result: SearchResult) {
    setActiveId(result.id)
    if (result.channelId) {
      const serverId = result.channel?.serverId ?? currentServerId
      if (!serverId) return

      if (result.channel?.type === 'forum') {
        void orchestratedGoToChannel(serverId, result.channelId).then(() => {
          const openForumPost = () => {
            Promise.all([
              import('@/stores/forum.store'),
              import('@/stores/forumReply.store')
            ]).then(([{ useForumStore }, { useForumReplyStore }]) => {
              const postId = result.threadParentId ?? result.id
              if (!useForumStore.getState().channelId) {
                useForumStore.setState({ channelId: result.channelId })
              }
              useForumStore.getState().openPost(postId)
              if (result.threadParentId) {
                const s = useForumReplyStore.getState()
                useForumReplyStore.setState({
                  scrollToMessageId: result.id,
                  scrollRequestNonce: s.scrollRequestNonce + 1
                })
              }
            })
          }
          let attempts = 0
          const waitForChannel = () => {
            const ch = useChannelStore.getState().channels.find((c) => c.id === result.channelId)
            if (ch || attempts >= 30) {
              openForumPost()
            } else {
              attempts++
              setTimeout(waitForChannel, 100)
            }
          }
          waitForChannel()
        })
      } else if (result.threadParentId) {
        // Thread reply in text channel: open thread panel
        void orchestratedGoToChannel(serverId, result.channelId).then(() => {
          setTimeout(() => {
            import('@/stores/message.store').then(({ useMessageStore }) => {
              const openWithParent = (msg: Message) => {
                import('@/stores/thread.store').then(({ useThreadStore }) => {
                  useThreadStore.getState().openThread(result.channelId!, msg, { focusMessageId: result.id })
                })
              }
              const msg = useMessageStore.getState().messages.find((m) => m.id === result.threadParentId)
              if (msg) {
                openWithParent(msg)
                return
              }
              api
                .get<{ messages: Message[] }>(
                  `/api/channels/${result.channelId}/messages?around=${result.threadParentId}&limit=1`
                )
                .then((res) => {
                  const parent = res.messages.find((m) => m.id === result.threadParentId)
                  if (parent) openWithParent(parent)
                })
                .catch(() => {})
            })
          }, 200)
        })
      } else {
        void orchestratedGoToChannel(serverId, result.channelId, result.id)
      }
    } else if (result.dmConversationId) {
      void orchestratedGoToDm(result.dmConversationId, result.id)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-white/10 bg-surface-dark md:w-80">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4">
        <h2 className="text-sm font-semibold text-white">{t('resultsTitle')}</h2>
        <IconButton label={t('closeSearch')} variant="ghost" size="md" onClick={onClose}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      {/* Search input */}
      <div className="border-b border-white/10 px-3 py-2">
        <div className="flex items-center rounded bg-surface-darkest px-2">
          <svg
            className="h-4 w-4 shrink-0 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={localQuery}
            onChange={(e) => handleLocalChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tNav('searchPlaceholder')}
            className="w-full bg-transparent px-2 py-1.5 text-sm text-gray-200 outline-none placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Scope selector */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 scrollbar-none">
        {defaultScope === 'conversation' ? (
          <>
            <ScopeBtn active={scope === 'conversation'} onClick={() => handleScopeChange('conversation')}>
              {t('scopeThisConversation')}
            </ScopeBtn>
            <ScopeBtn active={scope === 'dm'} onClick={() => handleScopeChange('dm')}>
              {t('scopeAllDms')}
            </ScopeBtn>
            <ScopeBtn active={scope === 'all'} onClick={() => handleScopeChange('all')}>
              {t('scopeEverywhere')}
            </ScopeBtn>
          </>
        ) : (
          <>
            {currentChannelId && (
              <ScopeBtn active={scope === 'channel'} onClick={() => handleScopeChange('channel')}>
                #{currentChannel?.name}
              </ScopeBtn>
            )}
            <ScopeBtn active={scope === 'server'} onClick={() => handleScopeChange('server')}>
              {t('scopeServer')}
            </ScopeBtn>
            <ScopeBtn active={scope === 'all'} onClick={() => handleScopeChange('all')}>
              {t('scopeEverywhere')}
            </ScopeBtn>
          </>
        )}
      </div>

      {/* Filter hints */}
      {!query.trim() && (
        <div className="border-b border-white/10 px-3 py-2">
          <p className="mb-1 text-[11px] font-medium text-gray-500">{t('searchFilters')}</p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                { label: 'has:image', insert: 'has:image ' },
                { label: 'has:file', insert: 'has:file ' },
                { label: 'has:attachment', insert: 'has:attachment ' },
                { label: 'has:video', insert: 'has:video ' },
                { label: 'has:link', insert: 'has:link ' },
                { label: 'has:poll', insert: 'has:poll ' },
                { label: 'has:pinned', insert: 'has:pinned ' },
                { label: 'in:thread', insert: 'in:thread ' },
                { label: 'in:root', insert: 'in:root ' },
                { label: 'from:username', insert: 'from:' },
                { label: 'tag:name', insert: 'tag:' },
                { label: 'after:date', insert: 'after:' },
                { label: 'before:date', insert: 'before:' },
              ] as const
            ).map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => {
                  setLocalQuery((prev) => prev + f.insert)
                  inputRef.current?.focus()
                }}
                className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-gray-400 transition hover:bg-white/10 hover:text-gray-300"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Result count */}
      {query.trim() && !loading && (
        <div className="border-b border-white/10 px-3 py-1.5">
          <span className="text-xs text-gray-500">
            {t('resultCount', { count: total })}
          </span>
        </div>
      )}

      {/* Results */}
      <SimpleBar className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="px-3 py-8 text-center text-sm text-gray-400">
            <p>{t('searchFailed')}</p>
            <button
              type="button"
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => doSearch(query, scope, offset)}
            >
              {tCommon('retry')}
            </button>
          </div>
        ) : results.length === 0 && query.trim() ? (
          <p className="px-3 py-8 text-center text-sm text-gray-400">{t('noResults')}</p>
        ) : results.length === 0 && !query.trim() ? (
          <p className="px-3 py-8 text-center text-sm text-gray-500">{t('typeToSearch')}</p>
        ) : (
          <div className="py-1">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleResultClick(r)}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-white/5 ${
                  activeId === r.id ? 'bg-white/[0.08]' : ''
                }`}
              >
                <UserAvatar
                  username={r.author?.username ?? 'Deleted User'}
                  avatarUrl={r.author?.avatarUrl ?? null}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-white">
                      {r.author?.displayName ?? r.author?.username ?? 'Deleted User'}
                    </span>
                    {r.channel ? (
                      <span className="shrink-0 text-[11px] text-gray-500">#{r.channel.name}</span>
                    ) : r.dmConversationId ? (
                      <span className="shrink-0 text-[11px] text-gray-500">{t('dmBadge')}</span>
                    ) : null}
                  </div>
                  {r.title && (
                    <p className="mt-0.5 text-xs font-semibold text-gray-200">{r.title}</p>
                  )}
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-300">{r.content}</p>
                  <time className="mt-1 block text-[10px] text-gray-500">{formatSmartTimestamp(r.createdAt)}</time>
                </div>
              </button>
            ))}
          </div>
        )}
      </SimpleBar>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setOffset(offset - PAGE_SIZE)}
            className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {t('previous')}
          </button>
          <span className="text-xs text-gray-500">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            {t('next')}
          </button>
        </div>
      )}
    </aside>
  )
}

function ScopeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded px-2 py-1 text-xs font-medium transition ${
        active ? 'bg-primary text-primary-text' : 'text-gray-400 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
