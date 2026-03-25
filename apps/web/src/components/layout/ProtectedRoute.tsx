import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <span className="sr-only">Loading session</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
