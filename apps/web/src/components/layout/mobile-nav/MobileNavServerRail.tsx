import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { JoinInviteModal } from '@/components/server/JoinInviteModal'
import { InAppNotificationBell } from '@/components/notifications/InAppNotificationBell'
import { SavedMessagesBell } from '@/components/chat/SavedMessagesBell'
import { UnreadDmShortcuts } from '@/components/dm/UnreadDmShortcuts'
import { useLayoutStore } from '@/stores/layout.store'
import { isDesktop } from '@/lib/desktop'
import { ServerRailList } from '@/components/server/ServerRailList'
import type { Server } from '@/stores/server.store'
import type { ServerBadge } from '@/lib/unread'
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

function SearchIcon() {
  return (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

type Props = {
  viewMode: 'dm' | 'server'
  servers: Server[]
  currentServerId: string | null
  isLoading: boolean
  hasDmUnread: boolean
  navigatingToServerId: string | null
  serverBadges: ReadonlyMap<string, ServerBadge>
  onDmClick: () => void
  onServerClick: (server: Server) => void
  onOpenQuickSwitcher: () => void
}

export function MobileNavServerRail({
  viewMode,
  servers,
  currentServerId,
  isLoading,
  hasDmUnread,
  navigatingToServerId,
  serverBadges,
  onDmClick,
  onServerClick,
  onOpenQuickSwitcher
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

        <SimpleBar className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-2 py-0.5">
            <UnreadDmShortcuts onNavigate={() => useLayoutStore.getState().closeNavDrawer()} />
            {isLoading && servers.length === 0 ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface" />
                ))}
              </>
            ) : (
              <ServerRailList servers={servers} isLoading={isLoading} currentServerId={currentServerId} viewMode={viewMode}
                navigatingToServerId={navigatingToServerId} serverBadges={serverBadges} onServerClick={onServerClick} />
            )}
          </div>
        </SimpleBar>

        {!isDesktop && (
          <SavedMessagesBell size="rail" className="rounded-lg bg-surface" />
        )}
        {!isDesktop && (
          <InAppNotificationBell size="rail" className="rounded-lg bg-surface" />
        )}
        <button
          type="button"
          title={t('findConversation')}
          aria-label={t('findConversation')}
          onClick={onOpenQuickSwitcher}
          className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <SearchIcon />
        </button>

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
