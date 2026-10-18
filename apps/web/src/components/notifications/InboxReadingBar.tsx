import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInboxStore } from '@/stores/inbox.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'
import { useThreadStore } from '@/stores/thread.store'
import { useForumStore } from '@/stores/forum.store'
import { inboxConversationPath } from '@/lib/inbox'

export function InboxReadingBar() {
  const { t } = useTranslation('nav')
  const { t: common } = useTranslation('common')
  const { pathname } = useLocation()
  const reader = useInboxStore((s) => s.reader)
  const session = useInboxStore((s) => s.session)
  const pending = useInboxStore((s) => s.pending)
  const error = useInboxStore((s) => s.error)
  const threadId = useThreadStore((s) => (s.isOpen ? s.parentMessage?.id : null))
  const postId = useForumStore((s) => s.currentPostId)
  if (!reader) return null
  const path = inboxConversationPath(reader.target)
  const active =
    pathname === path &&
    (!reader.target.threadParentId ||
      reader.target.threadParentId === threadId ||
      reader.target.threadParentId === postId)
  const reviewing = !!reader.sessionId && session?.id === reader.sessionId
  const actionClass = 'min-h-11 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-50'
  const advance = async (action: 'done' | 'later' | 'skip') => {
    if (await useInboxStore.getState().advance(action)) {
      void useReadStateStore.getState().fetchAll()
      void useNotificationCenterStore.getState().fetchUnread()
    }
  }
  return (
    <aside
      aria-label={t('inboxCatchup')}
      className="shrink-0 border-b border-primary/20 bg-primary/10 px-3 py-2 text-gray-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {reader.group.unavailable ? t('inboxUnavailable') : reader.group.name}
          </p>
          <p className="text-xs text-gray-400">
            {reviewing && session
              ? t('inboxProgress', { current: session.index + 1, total: session.groups.length })
              : t('inboxPreviewHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={actionClass}
            disabled={pending}
            onClick={() => void useInboxStore.getState().returnToInbox()}
          >
            {t('inboxBack')}
          </button>
          {reader.group.unavailable && reviewing ? (
            <button type="button" className={actionClass} disabled={pending} onClick={() => void advance('skip')}>
              {t('inboxNext')}
            </button>
          ) : !active ? (
            <>
              <button
                type="button"
                className={actionClass}
                onClick={() =>
                  reviewing ? useInboxStore.getState().resume() : useInboxStore.getState().read(reader.group)
                }
              >
                {t('inboxResumeReading')}
              </button>
              {reviewing && (
                <button type="button" className={actionClass} disabled={pending} onClick={() => void advance('skip')}>
                  {t('inboxNext')}
                </button>
              )}
            </>
          ) : reviewing ? (
            <>
              <button type="button" className={actionClass} disabled={pending} onClick={() => void advance('skip')}>
                {t('inboxNext')}
              </button>
              <button
                type="button"
                className={actionClass}
                disabled={pending || !reader.navigated}
                onClick={() => void advance('later')}
              >
                {t('inboxSaveLater')}
              </button>
              <button
                type="button"
                className={`${actionClass} bg-primary text-white hover:bg-primary/80`}
                disabled={pending || !reader.navigated}
                onClick={() => void advance('done')}
              >
                {t('inboxDone')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={actionClass}
              disabled={pending}
              onClick={() => void useInboxStore.getState().saveLater(reader.target)}
            >
              {t('inboxSaveLater')}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
          <p>{t(`inboxError_${error}`)}</p>
          <button
            type="button"
            className={actionClass}
            disabled={pending}
            onClick={() => void useInboxStore.getState().retry()}
          >
            {common('retry')}
          </button>
        </div>
      )}
    </aside>
  )
}
