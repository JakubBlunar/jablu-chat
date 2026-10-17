import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '@chat/shared'
import SimpleBar from 'simplebar-react'
import { UserAvatar } from '@/components/UserAvatar'
import { api, ApiError, resolveMediaUrl, type SearchResult } from '@/lib/api'
import { MessageMediaProvider, useMessageMedia } from '@/components/media/MessageMediaGallery'
import { formatSmartTimestamp } from '@/lib/format-time'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { IconButton, Spinner } from '@/components/ui'
import { useIsMobile } from '@/hooks/useMobile'
import { useNavigationStore } from '@/stores/navigation.store'
import { historyErrorKey, type HistoryErrorKey } from '@/lib/messageHistory'
import { MediaPreview } from '@/components/media/MediaPreview'

type Scope = 'server' | 'channel' | 'conversation' | 'dm' | 'all'
const PAGE_SIZE = 25
const FILTER_TOKEN = /(?<!\S)(has|from|in|tag|after|before):(?:"([^"]*)"|(\S*))/gi

function matchesFilter(token: string, filter: string) {
  const normalized = token.toLowerCase().replace(/^has:pin$/, 'has:pinned')
  return filter.endsWith(':') ? normalized.startsWith(filter) : normalized === filter
}

function findFilter(query: string, filter: string) {
  return Array.from(query.matchAll(FILTER_TOKEN))
    .filter((match) => matchesFilter(match[0], filter))
    .at(-1)
}

function replaceFilter(query: string, filter: string, replacement: string) {
  const without = query.replace(FILTER_TOKEN, (token) => (matchesFilter(token, filter) ? '' : token)).trim()
  return [without, replacement].filter(Boolean).join(' ')
}

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
  const { t: tChat } = useTranslation('chat')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const channels = useChannelStore((s) => s.channels)
  const currentChannel = channels.find((c) => c.id === currentChannelId)
  const { navigate, orchestratedGoToChannel, orchestratedGoToDm } = useAppNavigate()
  const [resultFailure, setResultFailure] = useState<{ result: SearchResult; key: HistoryErrorKey } | null>(null)
  const resultRequestRef = useRef(0)
  useEffect(
    () => () => {
      ++resultRequestRef.current
    },
    []
  )

  const [scope, setScope] = useState<Scope>(defaultScope)
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message?: string } | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localQuery, setLocalQuery] = useState(query)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestId = useRef(0)
  const isMobile = useIsMobile()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersId = useId()
  const filterLabels: Record<string, string> = {
    'has:image': 'filterImage',
    'has:video': 'filterVideo',
    'has:file': 'filterFile',
    'has:attachment': 'filterAttachment',
    'has:link': 'filterLink',
    'has:poll': 'filterPoll',
    'has:pinned': 'filterPinned',
    'has:pin': 'filterPinned',
    'in:thread': 'filterThread',
    'in:root': 'filterRoot'
  }
  const activeFilters = Array.from(localQuery.matchAll(FILTER_TOKEN)).filter((match) => !!(match[2] ?? match[3]))
  const filterName = (token: string, key: string, value: string) =>
    filterLabels[token.toLowerCase()]
      ? t(filterLabels[token.toLowerCase()])
      : `${t(({ from: 'filterSender', tag: 'filterTag', after: 'filterAfter', before: 'filterBefore' } as Record<string, string>)[key.toLowerCase()] ?? 'searchFilters')}: ${value}`

  useEffect(() => {
    setLocalQuery(query)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [query])

  const doSearch = useCallback(
    async (q: string, s: Scope, off: number) => {
      const request = ++requestId.current
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
        const data = await api.searchMessages(q, opts)
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') submit(localQuery)
    if (e.key === 'Escape') onClose()
  }

  function handleScopeChange(s: Scope) {
    setScope(s)
    setOffset(0)
  }

  async function handleResultClick(result: SearchResult) {
    const request = ++resultRequestRef.current
    setActiveId(result.id)
    setResultFailure(null)
    try {
      const query = new URLSearchParams({ m: result.id })
      if (result.threadParentId) query.set('thread', result.threadParentId)
      let path: string
      if (result.channelId) {
        const serverId = result.channel?.serverId ?? currentServerId
        if (!serverId) throw new Error('messageUnavailable')
        await orchestratedGoToChannel(
          serverId,
          result.channelId,
          result.channel?.type === 'forum' ? undefined : (result.threadParentId ?? result.id)
        )
        path = `/channels/${serverId}/${result.channelId}?${query}`
      } else if (result.dmConversationId) {
        await orchestratedGoToDm(result.dmConversationId, result.id)
        path = `/channels/@me/${result.dmConversationId}?${query}`
      } else {
        throw new Error('messageUnavailable')
      }
      if (request !== resultRequestRef.current) return
      const error = useNavigationStore.getState().error
      if (error) {
        useNavigationStore.getState().dismissError()
        throw new Error(error.key)
      }
      navigate(path)
      if (isMobile) onClose()
    } catch (error) {
      if (request !== resultRequestRef.current) return
      console.error('Failed to open search result', error)
      setResultFailure({ result, key: historyErrorKey(error) })
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-white/10 bg-surface-dark max-lg:[&_button]:min-h-11 max-lg:[&_button]:min-w-11 max-lg:[&_input]:min-h-11 max-lg:[&_input]:text-base">
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
      <div className="shrink-0 border-b border-white/10 px-3 py-2">
        <div className="composite-text-field flex items-center rounded bg-surface-darkest px-2 ring-1 ring-white/10 transition focus-within:ring-2 focus-within:ring-primary/55">
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
            aria-label={tNav('searchPlaceholder')}
            className="w-full bg-transparent px-2 py-1.5 text-sm text-gray-200 outline-none placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Scope selector */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 scrollbar-none">
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

      {(isMobile || activeFilters.length > 0) && (
        <div className="shrink-0 border-b border-white/10 px-3 py-1">
          {isMobile && (
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls={filtersId}
              className="min-h-11 text-sm text-primary"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {t(filtersOpen ? 'hideFilters' : 'showFilters')} {activeFilters.length > 0 && `(${activeFilters.length})`}
            </button>
          )}
          {activeFilters.length > 0 && (
            <div
              className="flex flex-wrap gap-1 max-lg:flex-nowrap max-lg:overflow-x-auto"
              aria-label={t('activeFilters')}
            >
              {activeFilters.map((match) => {
                const name = filterName(match[0], match[1], match[2] ?? match[3])
                return (
                  <button
                    type="button"
                    key={`${match.index}-${match[0]}`}
                    aria-label={t('removeFilter', { filter: name })}
                    className="min-h-11 shrink-0 rounded bg-primary/15 px-2 text-xs text-primary"
                    onClick={() =>
                      submit(
                        (localQuery.slice(0, match.index) + localQuery.slice(match.index + match[0].length)).trim()
                      )
                    }
                  >
                    {name} <span aria-hidden>&times;</span>
                  </button>
                )
              })}
              <button
                type="button"
                className="min-h-11 shrink-0 px-2 text-xs text-gray-400"
                onClick={() => submit(localQuery.replace(FILTER_TOKEN, '').trim())}
              >
                {t('clearFilters')}
              </button>
            </div>
          )}
        </div>
      )}
      {(!isMobile || filtersOpen) && (
        <div
          id={filtersId}
          className="border-b border-white/10 px-3 py-2 max-lg:max-h-[35dvh] max-lg:shrink-0 max-lg:overflow-y-auto"
        >
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
                { label: 'tag:name', insert: 'tag:' }
              ] as const
            )
              .filter(
                (filter) =>
                  !(
                    (scope === 'conversation' || scope === 'dm') &&
                    ['has:poll', 'in:thread', 'in:root', 'tag:name'].includes(filter.label)
                  )
              )
              .map((f) => (
                <button
                  key={f.label}
                  title={f.label}
                  type="button"
                  aria-pressed={f.insert.endsWith(' ') ? !!findFilter(localQuery, f.insert.trim()) : undefined}
                  onClick={() => {
                    if (f.insert.endsWith(' ')) {
                      const token = f.insert.trim()
                      submit(replaceFilter(localQuery, token, findFilter(localQuery, token) ? '' : token))
                    } else {
                      handleLocalChange(replaceFilter(localQuery, f.insert, f.insert))
                      if (timerRef.current) clearTimeout(timerRef.current)
                    }
                    inputRef.current?.focus()
                  }}
                  className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-gray-400 transition hover:bg-white/10 hover:text-gray-300 aria-pressed:bg-primary/20 aria-pressed:text-primary"
                >
                  {t(filterLabels[f.label] ?? (f.label === 'from:username' ? 'filterSender' : 'filterTag'))}
                </button>
              ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(['after', 'before'] as const).map((direction) => {
              const filter = findFilter(localQuery, `${direction}:`)
              return (
                <label key={direction} className="min-w-0 text-[11px] text-gray-400">
                  {t(direction === 'after' ? 'afterDate' : 'beforeDate')}
                  <input
                    type="date"
                    value={filter?.[2] ?? filter?.[3] ?? ''}
                    onChange={(event) => {
                      submit(
                        replaceFilter(
                          localQuery,
                          `${direction}:`,
                          event.target.value ? `${direction}:${event.target.value}` : ''
                        )
                      )
                    }}
                    className="ml-1 rounded bg-surface-darkest px-1 py-1 text-xs text-gray-200 [color-scheme:dark]"
                  />
                </label>
              )
            })}
          </div>
        </div>
      )}

      {/* Result count */}
      {resultFailure && (
        <div role="alert" className="shrink-0 border-b border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <p>{tChat(resultFailure.key)}</p>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() => void handleResultClick(resultFailure.result)}
          >
            {tCommon('retry')}
          </button>
        </div>
      )}
      {query.trim() && !loading && !error && (
        <div className="border-b border-white/10 px-3 py-1.5">
          <span className="text-xs text-gray-500">{t('resultCount', { count: total })}</span>
        </div>
      )}

      {/* Results */}
      <SimpleBar className="min-h-0 flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div role="alert" className="px-3 py-8 text-center text-sm text-gray-400">
            <p>{error.message ?? t('searchFailed')}</p>
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
            {results.map((r) => {
              const mediaAtts = (r.attachments ?? []).filter(
                (a) => a.type === 'image' || a.type === 'gif' || a.type === 'video'
              )
              return (
                <div
                  key={r.id}
                  className={`px-3 py-2.5 transition hover:bg-white/5 ${activeId === r.id ? 'bg-white/[0.08]' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleResultClick(r)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <UserAvatar
                      username={r.author?.username ?? tChat('deletedUser')}
                      avatarUrl={r.author?.avatarUrl ?? null}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {r.author?.displayName ?? r.author?.username ?? tChat('deletedUser')}
                        </span>
                        {r.channel ? (
                          <span className="shrink-0 text-[11px] text-gray-500">#{r.channel.name}</span>
                        ) : r.dmConversationId ? (
                          <span className="shrink-0 text-[11px] text-gray-500">{t('dmBadge')}</span>
                        ) : null}
                      </div>
                      {r.title && <p className="mt-0.5 text-xs font-semibold text-gray-200">{r.title}</p>}
                      {r.content && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-gray-300">{r.content}</p>
                      )}
                      <time className="mt-1 block text-[10px] text-gray-500">{formatSmartTimestamp(r.createdAt)}</time>
                    </div>
                  </button>
                  {mediaAtts.length > 0 && (
                    <MessageMediaProvider attachments={mediaAtts}>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-11">
                        {mediaAtts.map((att) => (
                          <SearchResultThumb key={att.id} attachment={att} />
                        ))}
                      </div>
                    </MessageMediaProvider>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SimpleBar>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between border-t border-white/10 px-3 py-2">
          <button
            type="button"
            disabled={loading || currentPage <= 1}
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
            disabled={loading || currentPage >= totalPages}
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

function SearchResultThumb({ attachment }: { attachment: Attachment }) {
  const { openByKey } = useMessageMedia()
  const src = resolveMediaUrl(attachment.thumbnailUrl ?? attachment.url) ?? attachment.url
  return (
    <MediaPreview
      src={src}
      alt={attachment.filename}
      compact
      video={attachment.type === 'video' && !attachment.thumbnailUrl}
      onOpen={() => openByKey(attachment.id)}
      className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-black/30"
    />
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
