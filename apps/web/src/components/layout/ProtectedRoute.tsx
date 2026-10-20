import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { t } = useTranslation('common')
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-surface">
        <div aria-hidden>
          <Spinner size="xl" />
        </div>
        <span className="sr-only">{t('loadingSession')}</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: `${location.pathname}${location.search}` }} replace />
  }

  return <>{children}</>
}
