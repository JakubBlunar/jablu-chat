import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CountBadge } from '@/components/ui'
import { useInboxStore } from '@/stores/inbox.store'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'

export function InAppNotificationBell({
  className = '',
  size = 'md'
}: {
  className?: string
  size?: 'sm' | 'md' | 'rail' | 'navigation'
}) {
  const { t } = useTranslation('nav')
  const unreadCount = useNotificationCenterStore((s) => s.unreadCount)
  const fetchUnread = useNotificationCenterStore((s) => s.fetchUnread)
  const open = useInboxStore((s) => s.open)
  useEffect(() => {
    void fetchUnread()
  }, [fetchUnread])
  const buttonSize =
    size === 'navigation'
      ? 'min-h-14 flex-1 flex-col gap-0.5 text-xs font-medium'
      : size === 'sm'
        ? 'h-7 w-7'
        : size === 'rail'
          ? 'h-9 w-9'
          : 'h-10 w-10'
  return (
    <button
      type="button"
      aria-label={unreadCount > 0 ? t('inboxUnread', { count: unreadCount }) : t('mobileInbox')}
      title={t('mobileInbox')}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={() => (open ? useInboxStore.getState().close() : useInboxStore.getState().show())}
      className={`relative flex ${buttonSize} shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white ${className}`}
    >
      <svg
        aria-hidden
        className={size === 'md' ? 'h-5 w-5' : 'h-[18px] w-[18px]'}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
      {size === 'navigation' && t('mobileInbox')}
      <CountBadge
        count={unreadCount}
        variant="danger"
        className={`absolute min-w-[1rem] px-0.5 text-[10px] ${size === 'navigation' ? 'left-[calc(50%+6px)] top-1' : '-right-0.5 -top-0.5'}`}
      />
    </button>
  )
}
