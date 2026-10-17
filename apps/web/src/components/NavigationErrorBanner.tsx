import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNavigationStore } from '@/stores/navigation.store'

export function NavigationErrorBanner() {
  const error = useNavigationStore((state) => state.error)
  const dismiss = useNavigationStore((state) => state.dismissError)
  const navigating = useNavigationStore((state) => state.isNavigating)
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  if (!error) return null
  return (
    <div
      role="alert"
      className="flex shrink-0 flex-wrap items-center gap-2 bg-red-500/15 px-4 py-1 text-sm text-red-200"
    >
      <span className="min-w-0 flex-1">{t(error.key)}</span>
      <button
        type="button"
        disabled={navigating}
        className="min-h-11 px-2 underline"
        onClick={() => {
          void error.retry().then((path) => {
            if (!useNavigationStore.getState().error)
              navigate(path ?? `${location.pathname}${location.search}`, { replace: !path })
          })
        }}
      >
        {tCommon('retry')}
      </button>
      <button type="button" className="min-h-11 px-2" onClick={dismiss}>
        {t('dismissHistoryError')}
      </button>
    </div>
  )
}
