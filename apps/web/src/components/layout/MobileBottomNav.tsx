import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InAppNotificationBell } from '@/components/notifications/InAppNotificationBell'
import { UserAvatar } from '@/components/UserAvatar'
import { useAuthStore } from '@/stores/auth.store'
import { useLayoutStore } from '@/stores/layout.store'
import { getVisualViewportBounds } from '@/hooks/useVisualViewport'

export function MobileBottomNav({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useTranslation('nav')
  const user = useAuthStore((s) => s.user)
  const drawerOpen = useLayoutStore((s) => s.navDrawerOpen)
  const [composing, setComposing] = useState(false)
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | undefined
    let sawKeyboard = false
    let dismissedKeyboard = false
    const update = (event?: Event) => {
      clearTimeout(blurTimer)
      const element = document.activeElement
      const bounds = getVisualViewportBounds()
      const keyboardOpen = bounds?.keyboardOpen ?? false
      const tappedComposer =
        event?.type === 'click' &&
        event.target instanceof HTMLTextAreaElement &&
        !!event.target.closest('[data-message-composer]')
      if (event?.type === 'focusin' || tappedComposer) {
        dismissedKeyboard = false
        sawKeyboard = false
      }
      if (keyboardOpen) {
        dismissedKeyboard = false
        sawKeyboard = true
      } else if (sawKeyboard && bounds && bounds.height >= bounds.layoutHeight - 1) {
        // iOS can dismiss its keyboard while keeping the textarea focused.
        sawKeyboard = false
        dismissedKeyboard = true
      }
      const insideComposer = element instanceof HTMLElement && !!element.closest('[data-message-composer]')
      setComposing(
        (previous) =>
          keyboardOpen ||
          (!dismissedKeyboard && insideComposer && (element instanceof HTMLTextAreaElement || previous))
      )
    }
    const onBlur = () => {
      blurTimer = setTimeout(update, 0)
    }
    const onComposerClick = (event: MouseEvent) => {
      if (event.target instanceof HTMLTextAreaElement && event.target.closest('[data-message-composer]')) update(event)
    }
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', onBlur)
    document.addEventListener('click', onComposerClick)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    window.addEventListener('pageshow', update)
    update()
    return () => {
      clearTimeout(blurTimer)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', onBlur)
      document.removeEventListener('click', onComposerClick)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('pageshow', update)
    }
  }, [])
  return (
    <nav
      aria-label={t('mobileNavigation')}
      hidden={composing}
      className={composing ? 'hidden' : 'flex shrink-0 border-t border-white/10 bg-surface-dark'}
    >
      <button
        type="button"
        aria-expanded={drawerOpen}
        onClick={() => useLayoutStore.getState().openNavDrawer()}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-primary"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
        </svg>
        {t('mobileChats')}
      </button>
      <InAppNotificationBell size="navigation" />
      <button
        type="button"
        aria-label={t('mobileYou')}
        onClick={onOpenSettings}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium text-gray-400 hover:text-white"
      >
        <UserAvatar
          username={user?.displayName ?? user?.username ?? ''}
          avatarUrl={user?.avatarUrl ?? null}
          size="sm"
          showStatus
          status={user?.status}
        />
        {t('mobileYou')}
      </button>
    </nav>
  )
}
