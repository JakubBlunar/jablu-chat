import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { JoinInviteModal } from '@/components/server/JoinInviteModal'
import { resolveMediaUrl } from '@/lib/api'
import type { Server } from '@/stores/server.store'
import { DmIcon } from './mobileNavIcons'

function JoinIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  )
}

export type ServerBadge = { unread: boolean; mentions: number }

type Props = {
  viewMode: 'dm' | 'server'
  servers: Server[]
  currentServerId: string | null
  isLoading: boolean
  hasDmUnread: boolean
  navigatingToServerId: string | null
  computeServerBadge: (serverId: string) => ServerBadge
  onDmClick: () => void
  onServerClick: (server: Server) => void
}

export function MobileNavServerRail({
  viewMode,
  servers,
  currentServerId,
  isLoading,
  hasDmUnread,
  navigatingToServerId,
  computeServerBadge,
  onDmClick,
  onServerClick
}: Props) {
  const { t } = useTranslation('nav')
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <>
      <aside className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 border-r border-black/20 bg-surface-darkest py-3">
        <div className="relative shrink-0">
          <button
            type="button"
            title={t('directMessages')}
            aria-label={t('directMessages')}
            onClick={onDmClick}
            className={`group relative flex h-12 w-12 shrink-0 items-center justify-center transition-all duration-200 ease-out ${
              viewMode === 'dm'
                ? 'rounded-2xl bg-primary text-primary-text'
                : 'rounded-[24px] bg-surface text-success hover:rounded-2xl hover:bg-primary hover:text-primary-text'
            }`}
          >
            <DmIcon />
          </button>
          {hasDmUnread && viewMode !== 'dm' && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-darkest bg-red-500" />
          )}
        </div>

        <div className="my-1 h-0.5 w-8 shrink-0 rounded-full bg-white/15" aria-hidden />

        <SimpleBar className="min-h-0 w-full flex-1" style={{ overflowX: 'hidden' }}>
          <div className="flex flex-col items-center gap-2 py-0.5">
            {isLoading && servers.length === 0 ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface" />
                ))}
              </>
            ) : (
              servers.map((server) => {
                const active = viewMode === 'server' && server.id === currentServerId
                const initial = server.name.trim().charAt(0).toUpperCase() || '?'
                const badge = active ? null : computeServerBadge(server.id)
                return (
                  <div key={server.id} className="group/pill relative flex w-full justify-center">
                    <span
                      className={`absolute left-0 top-1/2 z-10 w-1 -translate-y-1/2 rounded-r-full bg-white transition-all duration-200 ${
                        active ? 'h-10 opacity-100' : 'h-0 opacity-0 group-hover/pill:h-5 group-hover/pill:opacity-80'
                      }`}
                      aria-hidden
                    />
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => onServerClick(server)}
                        title={server.name}
                        aria-label={server.name}
                        className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden text-sm font-semibold text-white transition-all duration-200 ease-out ${
                          active ? 'rounded-2xl bg-primary' : 'rounded-[24px] bg-surface hover:rounded-2xl hover:bg-primary'
                        }`}
                      >
                        {server.iconUrl ? (
                          <img src={resolveMediaUrl(server.iconUrl)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initial
                        )}
                        {navigatingToServerId === server.id && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/50">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          </div>
                        )}
                      </button>
                      {badge && badge.mentions > 0 && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface-darkest bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white">
                          {badge.mentions > 10 ? '10+' : badge.mentions}
                        </span>
                      )}
                      {badge && badge.unread && badge.mentions === 0 && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-darkest bg-red-500" />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </SimpleBar>

        <button
          type="button"
          title={t('joinServer')}
          aria-label={t('joinServer')}
          onClick={() => setJoinOpen(true)}
          className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-[24px] bg-surface text-success transition-all duration-200 ease-out hover:rounded-2xl hover:bg-success hover:text-white"
        >
          <JoinIcon />
        </button>
      </aside>

      {joinOpen && <JoinInviteModal onClose={() => setJoinOpen(false)} />}
    </>
  )
}
