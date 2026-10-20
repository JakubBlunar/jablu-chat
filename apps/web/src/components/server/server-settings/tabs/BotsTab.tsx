import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, InlineAlert, ConfirmDialog } from '@/components/ui'
import { RoleBadge } from '@/components/ui/RoleBadge'
import { UserAvatar } from '@/components/UserAvatar'
import { api } from '@/lib/api'
import type { Server } from '@/stores/server.store'
import { TrashIcon } from '../serverSettingsIcons'
import { getAppIntlLocale } from '@/lib/format-time'

type BotSearchHit = { id: string; username: string; displayName: string | null; avatarUrl: string | null }

type ServerBotMember = {
  userId: string
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; isBot: boolean }
  joinedAt: string
  roles: { id: string; name: string; color: string | null }[]
}

function ServerBotRow({
  serverId,
  bot,
  onRemoved,
  onRemoveFailed,
}: {
  serverId: string
  bot: ServerBotMember
  onRemoved: () => void
  onRemoveFailed: () => void
}) {
  const { t } = useTranslation('server-settings')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  const handleRemove = useCallback(async () => {
    setConfirmOpen(false)
    try {
      await api.removeBotFromServer(serverId, bot.userId)
      onRemoved()
    } catch {
      onRemoveFailed()
    }
  }, [serverId, bot.userId, onRemoved, onRemoveFailed])

  return (
    <div className="flex items-center gap-3 rounded-md bg-surface-dark px-4 py-3">
      <UserAvatar username={bot.user.username} avatarUrl={bot.user.avatarUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {bot.user.displayName ?? bot.user.username}
        </p>
        <p className="truncate text-xs text-gray-500">@{bot.user.username}</p>
        <p className="mt-0.5 text-xs text-gray-400">
          {t('bots.joined', { date: new Date(bot.joinedAt).toLocaleDateString(getAppIntlLocale()) })}
        </p>
        {bot.roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {bot.roles.map((r) => (
              <RoleBadge key={r.id} name={r.name} color={r.color} size="sm" />
            ))}
          </div>
        )}
      </div>
      <div ref={actionsRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded p-1 text-red-400 transition hover:bg-red-500/20"
          title={t('bots.remove')}
        >
          <TrashIcon />
        </button>
        {confirmOpen && (
          <ConfirmDialog
            title={t('bots.remove')}
            description={t('bots.removeConfirm', { username: bot.user.username })}
            confirmLabel={t('actions.remove')}
            cancelLabel={t('actions.cancel')}
            anchorRef={actionsRef}
            onConfirm={() => void handleRemove()}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

export function BotsTab({ server }: { server: Server }) {
  const { t } = useTranslation('server-settings')
  const [bots, setBots] = useState<ServerBotMember[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BotSearchHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addingUsername, setAddingUsername] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const searchWrapRef = useRef<HTMLDivElement>(null)

  const fetchBots = useCallback(async () => {
    setListError(null)
    try {
      const list = await api.listServerBots(server.id)
      setBots(list as ServerBotMember[])
    } catch {
      setListError(t('bots.loadFailed'))
      setBots([])
    } finally {
      setLoading(false)
    }
  }, [server.id, t])

  useEffect(() => {
    void fetchBots()
  }, [fetchBots])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (debouncedQuery.length === 0) {
      setSearchResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    let cancelled = false
    setSearchLoading(true)
    setSearchError(null)
    void (async () => {
      try {
        const hits = await api.searchBots(debouncedQuery)
        if (!cancelled) setSearchResults(hits)
      } catch {
        if (!cancelled) {
          setSearchResults([])
          setSearchError(t('bots.searchFailed'))
        }
      } finally {
        if (!cancelled) setSearchLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedQuery, t])

  useEffect(() => {
    if (!dropdownOpen) return
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current?.contains(e.target as Node)) return
      setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [dropdownOpen])

  const memberBotIds = new Set(bots.map((b) => b.userId))
  const filteredHits = searchResults.filter((h) => !memberBotIds.has(h.id))

  const handleAdd = useCallback(
    async (username: string) => {
      setAddError(null)
      setAddingUsername(username)
      try {
        await api.addBotToServer(server.id, username)
        setQuery('')
        setDebouncedQuery('')
        setSearchResults([])
        setDropdownOpen(false)
        await fetchBots()
      } catch {
        setAddError(t('bots.addFailed', { username }))
      } finally {
        setAddingUsername(null)
      }
    },
    [server.id, fetchBots, t]
  )

  const onInputFocus = useCallback(() => {
    if (query.trim().length > 0) setDropdownOpen(true)
  }, [query])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setQuery(v)
    setAddError(null)
    if (v.trim().length > 0) setDropdownOpen(true)
    else setDropdownOpen(false)
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-400">{t('actions.loading')}</p>
  }

  const showDropdown = dropdownOpen && query.trim().length > 0

  return (
    <div className="space-y-6">
      {listError && <InlineAlert variant="error">{listError}</InlineAlert>}
      {addError && <InlineAlert variant="error">{addError}</InlineAlert>}
      {removeError && <InlineAlert variant="error">{removeError}</InlineAlert>}

      <div ref={searchWrapRef} className="relative rounded-md bg-surface-dark p-4">
        <h3 className="mb-3 text-sm font-semibold text-white">{t('bots.addTitle')}</h3>
        <Input
          id="bot-search"
          label={t('bots.searchLabel')}
          value={query}
          onChange={onInputChange}
          onFocus={onInputFocus}
          placeholder={t('bots.searchPlaceholder')}
          autoComplete="off"
        />
        {showDropdown && (
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-white/10 bg-surface-darkest py-1 shadow-lg">
            {searchError && <p className="px-3 py-2 text-xs text-red-400">{searchError}</p>}
            {!searchError && searchLoading && (
              <p className="px-3 py-2 text-xs text-gray-400">{t('bots.searching')}</p>
            )}
            {!searchError && !searchLoading && filteredHits.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-500">{t('bots.noBotsFound')}</p>
            )}
            {!searchError &&
              !searchLoading &&
              filteredHits.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  disabled={addingUsername !== null}
                  onClick={() => void handleAdd(hit.username)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/5 disabled:opacity-50"
                >
                  <UserAvatar username={hit.username} avatarUrl={hit.avatarUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {hit.displayName ?? hit.username}
                    </p>
                    <p className="truncate text-xs text-gray-500">@{hit.username}</p>
                  </div>
                  {addingUsername === hit.username && (
                    <span className="shrink-0 text-xs text-gray-400">{t('bots.adding')}</span>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">{t('bots.inServer')}</h3>
        {bots.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 bg-surface-darkest/50 px-4 py-8 text-center">
            <p className="text-sm text-gray-400">{t('bots.empty')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('bots.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {bots.map((b) => (
              <ServerBotRow
                key={b.userId}
                serverId={server.id}
                bot={b}
                onRemoved={() => {
                  setRemoveError(null)
                  setBots((prev) => prev.filter((x) => x.userId !== b.userId))
                }}
                onRemoveFailed={() => setRemoveError(t('bots.removeFailed'))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
