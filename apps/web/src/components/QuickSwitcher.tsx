import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Kbd } from '@/components/ui/Kbd'
import { useNavigate } from 'react-router-dom'
import type { Channel } from '@chat/shared'
import { type DmConversation } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore, type Server } from '@/stores/server.store'

type ResultItem =
  | { kind: 'channel'; channel: Channel }
  | { kind: 'dm'; conversation: DmConversation }
  | { kind: 'server'; server: Server }

function filterResults(query: string, channels: Channel[], conversations: DmConversation[], servers: Server[], myUserId: string | undefined) {
  if (!query) {
    return {
      channels: channels.slice(0, 8),
      dms: conversations.slice(0, 8),
      servers: servers.slice(0, 8)
    }
  }
  const q = query.toLowerCase()
  return {
    channels: channels.filter((c) => c.name.toLowerCase().includes(q)),
    dms: conversations.filter((c) => {
      if (c.groupName?.toLowerCase().includes(q)) return true
      return c.members.some(
        (m) =>
          m.userId !== myUserId &&
          (m.username.toLowerCase().includes(q) || m.displayName?.toLowerCase().includes(q))
      )
    }),
    servers: servers.filter((s) => s.name.toLowerCase().includes(q))
  }
}

function flattenResults(
  channels: Channel[],
  dms: DmConversation[],
  servers: Server[]
): ResultItem[] {
  return [
    ...channels.map((channel): ResultItem => ({ kind: 'channel', channel })),
    ...dms.map((conversation): ResultItem => ({ kind: 'dm', conversation })),
    ...servers.map((server): ResultItem => ({ kind: 'server', server }))
  ]
}

function getDmDisplayName(conv: DmConversation, myUserId: string | undefined): string {
  if (conv.isGroup && conv.groupName) return conv.groupName
  const others = conv.members.filter((m) => m.userId !== myUserId)
  if (others.length === 0) return 'Unknown'
  return others.map((m) => m.displayName || m.username).join(', ')
}

function HashIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M4 9h16M4 15h16M10 3l-2 18M16 3l-2 18" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

export function QuickSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const channels = useChannelStore((s) => s.channels)
  const conversations = useDmStore((s) => s.conversations)
  const servers = useServerStore((s) => s.servers)
  const currentServer = useServerStore((s) => {
    if (!s.currentServerId) return null
    return s.servers.find((x) => x.id === s.currentServerId) ?? null
  })
  const myUserId = useAuthStore((s) => s.user?.id)
  const navigateToChannel = useNavigationStore((s) => s.navigateToChannel)
  const navigateToDm = useNavigationStore((s) => s.navigateToDm)

  const { channels: filteredChannels, dms: filteredDms, servers: filteredServers } = useMemo(
    () => filterResults(query, channels, conversations, servers, myUserId),
    [query, channels, conversations, servers, myUserId]
  )

  const items = useMemo(
    () => flattenResults(filteredChannels, filteredDms, filteredServers),
    [filteredChannels, filteredDms, filteredServers]
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const handleSelect = useCallback(
    async (item: ResultItem) => {
      onClose()
      if (item.kind === 'channel') {
        const path = await navigateToChannel({ serverId: item.channel.serverId, channelId: item.channel.id })
        if (path) navigate(path)
      } else if (item.kind === 'dm') {
        const path = await navigateToDm({ conversationId: item.conversation.id })
        if (path) navigate(path)
      } else {
        const path = await navigateToChannel({ serverId: item.server.id })
        if (path) navigate(path)
      }
    },
    [onClose, navigateToChannel, navigateToDm, navigate]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + items.length) % Math.max(items.length, 1))
      } else if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault()
        void handleSelect(items[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [items, selectedIndex, handleSelect, onClose]
  )

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  const channelStart = 0
  const dmStart = filteredChannels.length
  const serverStart = dmStart + filteredDms.length

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-4 md:bg-transparent md:pt-[15vh]"
      role="none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="mx-3 w-full max-w-lg rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10"
        role="combobox"
        aria-expanded="true"
        aria-haspopup="listbox"
        onKeyDown={handleKeyDown}
      >
        <div className="composite-text-field flex items-center gap-2 rounded-t-xl border-b border-white/10 px-4 py-3 transition focus-within:ring-2 focus-within:ring-primary/55">
          <svg className="h-5 w-5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('quickSwitcherPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label={tCommon('close')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <Kbd className="hidden md:inline-flex">ESC</Kbd>
        </div>

        <div ref={listRef} className="chat-scroll max-h-[60dvh] overflow-y-auto p-2 md:max-h-80" role="listbox">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-500">{t('quickSwitcherNoResults')}</p>
          )}

          {filteredChannels.length > 0 && (
            <>
              <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {t('channels')}
                {currentServer ? ` — ${currentServer.name}` : ''}
              </p>
              {filteredChannels.map((ch, i) => (
                <button
                  key={ch.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === channelStart + i}
                  data-selected={selectedIndex === channelStart + i}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    selectedIndex === channelStart + i
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                  onClick={() => void handleSelect({ kind: 'channel', channel: ch })}
                  onMouseEnter={() => setSelectedIndex(channelStart + i)}
                >
                  {ch.type === 'voice' ? <VoiceIcon /> : <HashIcon />}
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </>
          )}

          {filteredDms.length > 0 && (
            <>
              <p className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {t('directMessages')}
              </p>
              {filteredDms.map((conv, i) => (
                <button
                  key={conv.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === dmStart + i}
                  data-selected={selectedIndex === dmStart + i}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    selectedIndex === dmStart + i
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                  onClick={() => void handleSelect({ kind: 'dm', conversation: conv })}
                  onMouseEnter={() => setSelectedIndex(dmStart + i)}
                >
                  <ChatIcon />
                  <span className="truncate">{getDmDisplayName(conv, myUserId)}</span>
                </button>
              ))}
            </>
          )}

          {filteredServers.length > 0 && (
            <>
              <p className="px-2 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {t('servers')}
              </p>
              {filteredServers.map((srv, i) => (
                <button
                  key={srv.id}
                  type="button"
                  role="option"
                  aria-selected={selectedIndex === serverStart + i}
                  data-selected={selectedIndex === serverStart + i}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    selectedIndex === serverStart + i
                      ? 'bg-white/10 text-white'
                      : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                  onClick={() => void handleSelect({ kind: 'server', server: srv })}
                  onMouseEnter={() => setSelectedIndex(serverStart + i)}
                >
                  <ServerIcon />
                  <span className="truncate">{srv.name}</span>
                  <span className="ml-auto text-xs text-gray-500">
                    {t('memberCount', { count: srv.memberCount })}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
