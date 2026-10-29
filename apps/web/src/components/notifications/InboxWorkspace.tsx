import type { InboxGroup, InboxView } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { inboxTargetPath } from '@/lib/inbox'
import { useAuthStore } from '@/stores/auth.store'
import { useInboxStore, type InboxTab } from '@/stores/inbox.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useThreadStore } from '@/stores/thread.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useIsMobile } from '@/hooks/useMobile'
import { InboxActivity } from './InboxActivity'
import { CountBadge, Spinner } from '@/components/ui'

export function InboxWorkspace() {
  const userId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? null) : null))
  const open = useInboxStore((s) => s.open)
  const readerRequest = useInboxStore((s) => s.reader?.requestId)
  const navigate = useNavigate()
  useEffect(() => {
    useInboxStore.getState().syncUser(userId)
    if (userId) void useInboxStore.getState().loadSession()
  }, [userId])
  useEffect(() => {
    const reader = useInboxStore.getState().reader
    if (!reader || reader.group.unavailable) return
    useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
    useThreadStore.getState().closeThread()
    useLayoutStore.getState().closeNavDrawer()
    navigate(inboxTargetPath(reader.target))
  }, [readerRequest, navigate])
  return userId && open ? <InboxPanel /> : null
}

const TABS: InboxTab[] = ['activity', 'unread', 'mentions', 'replies', 'later']
const button = 'min-h-11 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50'

function InboxPanel() {
  const { t } = useTranslation('nav')
  const { t: common } = useTranslation('common')
  const isMobile = useIsMobile()
  const panel = useRef<HTMLDivElement>(null)
  const tablist = useRef<HTMLDivElement>(null)
  const close = useCallback(() => useInboxStore.getState().close(), [])
  const { tab, counts, groups, loading, pending, error, nextCursor, session, sessionLoaded, newActivity, keepCurrentView } =
    useInboxStore(
      useShallow((s) => ({
        tab: s.tab,
        counts: s.counts,
        groups: s.groups,
        loading: s.loading,
        pending: s.pending,
        error: s.error,
        nextCursor: s.nextCursor,
        session: s.session,
        sessionLoaded: s.sessionLoaded,
        newActivity: s.newActivity,
        keepCurrentView: s.keepCurrentView
      }))
    )
  const { notificationCount, notificationError } = useNotificationCenterStore(
    useShallow((s) => ({ notificationCount: s.unreadCount, notificationError: s.unreadError }))
  )
  useFocusTrap(panel, true, close)
  useBackGestureClose(true, close, isMobile)
  useEffect(() => {
    void useInboxStore.getState().fetchPage()
  }, [tab])
  useEffect(() => {
    void useInboxStore.getState().loadSession()
  }, [])
  useEffect(() => {
    const container = tablist.current
    const selected = container?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!container || !selected) return
    const bounds = container.getBoundingClientRect()
    const active = selected.getBoundingClientRect()
    if (active.left < bounds.left) container.scrollLeft += active.left - bounds.left
    else if (active.right > bounds.right) container.scrollLeft += active.right - bounds.right
  }, [tab])
  const unfinished = !!session && session.index < session.groups.length
  const refresh = () => {
    void useInboxStore.getState().fetchPage()
    void useInboxStore.getState().loadSession()
  }
  const start = () => {
    void useInboxStore.getState().start(!unfinished)
  }
  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 md:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('mobileInbox')}
        onPointerDownCapture={keepCurrentView}
        onKeyDownCapture={keepCurrentView}
        onWheelCapture={keepCurrentView}
        onTouchMoveCapture={keepCurrentView}
        className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-surface-dark pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-gray-200 shadow-2xl md:h-[min(85dvh,850px)] md:max-w-4xl md:rounded-2xl md:ring-1 md:ring-white/10"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 md:px-6">
          <div>
            <h1 className="text-xl font-bold text-white">{t('mobileInbox')}</h1>
            <p className="text-xs text-gray-400">{t('inboxReviewHint')}</p>
          </div>
          <button type="button" className={button} onClick={close} aria-label={common('close')}>
            &times;
          </button>
        </header>
        <div
          ref={tablist}
          role="tablist"
          aria-label={t('inboxViews')}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 scrollbar-none"
        >
          {TABS.map((view, index) => (
            <button
              key={view}
              type="button"
              role="tab"
              id={`inbox-tab-${view}`}
              aria-controls="inbox-content"
              aria-label={
                view === 'activity'
                  ? `${t('inboxTab_activity')} ${notificationError ? t('inboxCountFailed') : notificationCount}`
                  : `${t(`inboxTab_${view}`)} ${counts[view]}`
              }
              aria-selected={tab === view}
              tabIndex={tab === view ? 0 : -1}
              onKeyDown={(event) => {
                let next: number | undefined
                if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
                if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
                if (event.key === 'Home') next = 0
                if (event.key === 'End') next = TABS.length - 1
                if (next !== undefined) {
                  event.preventDefault()
                  useInboxStore.getState().selectTab(TABS[next])
                  document.getElementById(`inbox-tab-${TABS[next]}`)?.focus()
                }
              }}
              onClick={() => useInboxStore.getState().selectTab(view)}
              className={`${button} flex shrink-0 items-center ${tab === view ? 'bg-primary/20 text-white ring-1 ring-primary/40' : 'text-gray-400'}`}
            >
              {t(`inboxTab_${view}`)}
              {view === 'activity' ? (
                notificationError ? (
                  <span aria-hidden="true" className="ml-1.5 text-red-300" title={t('inboxCountFailed')}>!</span>
                ) : (
                  <CountBadge count={notificationCount} className="ml-1.5" />
                )
              ) : (
                <span className="ml-1.5 text-xs opacity-70">{counts[view]}</span>
              )}
            </button>
          ))}
        </div>
        <div
          id="inbox-content"
          role="tabpanel"
          aria-labelledby={`inbox-tab-${tab}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          {error && (
            <div role="alert" className="mx-4 mt-3 shrink-0 rounded-lg bg-red-500/10 p-3 text-sm text-red-200">
              <p>{t(`inboxError_${error}`)}</p>
              <button
                type="button"
                className={button}
                disabled={loading || pending}
                onClick={() => void useInboxStore.getState().retry()}
              >
                {common('retry')}
              </button>
            </div>
          )}
          {tab === 'activity' ? (
            <>
              {unfinished && session && (
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-primary/5 px-4 py-3 md:px-6">
                  <p className="text-sm text-gray-300">
                    {t('inboxProgress', { current: session.index + 1, total: session.groups.length })}
                  </p>
                  <button
                    className={`${button} bg-primary text-white hover:bg-primary/80`}
                    type="button"
                    disabled={pending || !sessionLoaded}
                    onClick={start}
                  >
                    {t('inboxContinueCatchup')}
                  </button>
                </div>
              )}
              <InboxActivity onNavigate={() => {
                useLayoutStore.getState().closeNavDrawer()
                close()
              }} />
            </>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 md:px-6">
                <p className="text-sm text-gray-300">{t('inboxConversationCount', { count: counts[tab] })}</p>
                <div className="flex flex-wrap gap-1">
                  <button className={button} type="button" disabled={loading || pending} onClick={refresh}>
                    {t('inboxRefresh')}
                  </button>
                  <button
                    className={`${button} bg-primary text-white hover:bg-primary/80`}
                    type="button"
                    disabled={pending || !sessionLoaded || (!unfinished && !counts[tab])}
                    onClick={start}
                  >
                    {t(unfinished ? 'inboxContinueCatchup' : 'inboxStartCatchup')}
                  </button>
                </div>
              </div>
              {session && !unfinished && (
                <div
                  role="status"
                  className="border-b border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200 md:px-6"
                >
                  {t(session.deferred ? 'inboxSessionDeferred' : 'inboxSessionComplete', { count: session.deferred })}
                </div>
              )}
              {newActivity && (
                <button
                  className={`${button} mx-4 mt-3 bg-primary/10 text-primary`}
                  type="button"
                  disabled={loading || pending}
                  onClick={refresh}
                >
                  {t('inboxNewActivity')}
                </button>
              )}
              <div
                className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6"
                aria-busy={loading}
              >
                {loading && !groups.length ? (
                  <div role="status" className="flex justify-center p-8">
                    <Spinner size="lg" />
                    <span className="sr-only">{common('loading')}</span>
                  </div>
                ) : !groups.length && !error ? (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
                    <p className="text-lg font-semibold text-white">
                      {t(tab === 'later' ? 'inboxLaterEmpty' : 'inboxViewEmpty')}
                    </p>
                    <p className="max-w-sm text-sm text-gray-400">
                      {t(tab === 'later' ? 'inboxLaterHint' : 'inboxEmptyHint')}
                    </p>
                  </div>
                ) : null}
                <ul className="space-y-3">
                  {groups.map((group) => (
                    <InboxConversation key={group.key} group={group} view={tab} />
                  ))}
                </ul>
                {nextCursor && (
                  <button
                    type="button"
                    className={`${button} mt-3 w-full text-primary`}
                    disabled={loading || pending}
                    onClick={() => void useInboxStore.getState().fetchPage(true)}
                  >
                    {t('inboxLoadMore')}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function InboxConversation({ group, view }: { group: InboxGroup; view: InboxView }) {
  const { t, i18n } = useTranslation('nav')
  const { t: common } = useTranslation('common')
  const pending = useInboxStore((s) => s.pending)
  const [expanded, setExpanded] = useState(false)
  const highlights = expanded ? group.highlights : group.highlights.slice(0, 1)
  return (
    <li className="min-w-0 rounded-xl border border-white/10 bg-surface/50 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {group.serverName && <p className="truncate text-xs text-gray-400">{group.serverName}</p>}
          <h2 className="break-words font-semibold text-white">
            {group.target.mode === 'channel' ? '#' : ''}
            {group.name}
          </h2>
          {group.target.threadParentId && <p className="text-xs text-primary">{t('inboxThread')}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
            {group.unreadCount > 0 && (
              <span>
                {t('inboxMessageCount', {
                  count: group.unreadCount,
                  amount: group.unreadCount >= 100 ? '100+' : group.unreadCount
                })}
              </span>
            )}
            {group.mentionCount > 0 && (
              <span className="text-primary">{t('inboxMentionCount', { count: group.mentionCount })}</span>
            )}
            {group.replyCount > 0 && <span>{t('inboxReplyCount', { count: group.replyCount })}</span>}
          </div>
        </div>
        <time dateTime={group.latestAt} className="shrink-0 text-xs text-gray-500">
          {new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric' }).format(new Date(group.latestAt))}
        </time>
      </div>
      <ul className="mt-3 space-y-2">
        {highlights.map((highlight) => (
          <li key={highlight.messageId}>
            <button
              type="button"
              className="min-h-11 w-full rounded-lg px-2 py-1 text-left hover:bg-white/5"
              onClick={() =>
                useInboxStore.getState().read({ ...group, target: { ...group.target, messageId: highlight.messageId } })
              }
            >
              <span className="mr-1 text-sm font-medium text-gray-200">{highlight.authorName}:</span>
              <span className="break-words text-sm text-gray-400">{highlight.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
      {group.highlights.length > 1 && (
        <button
          type="button"
          className={`${button} text-xs text-gray-400`}
          onClick={() => setExpanded((value) => !value)}
        >
          {t(expanded ? 'inboxLess' : 'inboxHighlights', { count: group.highlights.length })}
        </button>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          className={`${button} bg-white/5 text-white`}
          onClick={() => useInboxStore.getState().read(group)}
        >
          {t('inboxRead')}
        </button>
        {view === 'later' ? (
          <button
            type="button"
            className={`${button} text-gray-300`}
            disabled={pending}
            onClick={() => void useInboxStore.getState().removeLater(group.target)}
          >
            {common('remove')}
          </button>
        ) : (
          <button
            type="button"
            className={`${button} text-gray-300`}
            disabled={pending || !!group.savedAt}
            onClick={() => void useInboxStore.getState().saveLater(group.target)}
          >
            {t(group.savedAt ? 'inboxSavedLater' : 'inboxSaveLater')}
          </button>
        )}
        <button
          type="button"
          className={`${button} text-gray-300`}
          disabled={pending}
          onClick={() => void useInboxStore.getState().markRead(group)}
        >
          {t('inboxMarkRead')}
        </button>
      </div>
    </li>
  )
}
