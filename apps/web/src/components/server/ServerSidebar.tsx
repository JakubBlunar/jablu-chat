import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import SimpleBar from 'simplebar-react'
import { JoinInviteModal } from '@/components/server/JoinInviteModal'
import { InAppNotificationBell } from '@/components/notifications/InAppNotificationBell'
import { SavedMessagesBell } from '@/components/chat/SavedMessagesBell'
import { UnreadDmShortcuts } from '@/components/dm/UnreadDmShortcuts'
import { isDesktop } from '@/lib/desktop'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useNavigationStore } from '@/stores/navigation.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { useServerStore } from '@/stores/server.store'
import { computeServerBadges } from '@/lib/unread'
import { ServerRailList } from './ServerRailList'

function DmIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm0 2v10h16V6H4zm2 2h8v2H6V8zm0 4h5v2H6v-2z" />
    </svg>
  )
}

function JoinIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  )
}

export function ServerSidebar() {
  const { t } = useTranslation('nav')
  const { servers, currentServerId, viewMode, isLoading } = useServerStore(
    useShallow((s) => ({
      servers: s.servers,
      currentServerId: s.currentServerId,
      viewMode: s.viewMode,
      isLoading: s.isLoading
    }))
  )
  const { goToDms, goToChannel } = useAppNavigate()
  const navigatingToServerId = useNavigationStore((s) => s.navigatingToServerId)

  const { dmReadStates, channelReadStates, channelToServer } = useReadStateStore(
    useShallow((s) => ({
      dmReadStates: s.dms,
      channelReadStates: s.channels,
      channelToServer: s.channelToServer
    }))
  )
  const { notifPrefs, serverPrefs, getEffective } = useNotifPrefStore(
    useShallow((s) => ({
      notifPrefs: s.prefs,
      serverPrefs: s.serverPrefs,
      getEffective: s.getEffective
    }))
  )

  const hasDmUnread = Array.from(dmReadStates.values()).some((rs) => rs.unreadCount > 0)

  const serverBadges = useMemo(
    () => computeServerBadges(channelReadStates, channelToServer, getEffective),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getEffective, channelReadStates, channelToServer, notifPrefs, serverPrefs]
  )

  const [joinOpen, setJoinOpen] = useState(false)

  useEffect(() => {
    const open = () => setJoinOpen(true)
    window.addEventListener('open-join-server', open)
    return () => window.removeEventListener('open-join-server', open)
  }, [])

  const handleDmClick = () => {
    goToDms()
  }

  return (
    <>
      <aside className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 bg-surface-darkest py-3">
        <div className="relative">
          <button
            type="button"
            title={t('directMessages')}
            aria-label={t('directMessages')}
            onClick={handleDmClick}
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

        <div className="my-1 h-0.5 w-8 rounded-full bg-white/15" aria-hidden />

        <SimpleBar className="min-h-0 w-full flex-1">
          <div className="flex flex-col items-center gap-2 py-0.5">
            <UnreadDmShortcuts />
            {isLoading && servers.length === 0 ? (
              <>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface" />
                ))}
              </>
            ) : (
              <ServerRailList servers={servers} isLoading={isLoading} currentServerId={currentServerId} viewMode={viewMode}
                navigatingToServerId={navigatingToServerId} serverBadges={serverBadges}
                onServerClick={(server) => void goToChannel(server.id)} />
            )}
          </div>
        </SimpleBar>

        {/* Saved messages + Inbox live in the custom title bar on desktop; show them here on web only. */}
        {!isDesktop && (
          <>
            <SavedMessagesBell size="rail" className="rounded-lg bg-surface" />
            <InAppNotificationBell size="rail" className="rounded-lg bg-surface" />
          </>
        )}

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
