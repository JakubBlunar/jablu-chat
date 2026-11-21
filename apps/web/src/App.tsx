import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DesktopChrome } from './components/desktop/DesktopChrome'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { RestoreLastLocation } from './components/layout/RestoreLastLocation'
import { isElectron } from './lib/electron'
import { api } from './lib/api'
import './stores/settings.store'
import { showToast } from './stores/toast.store'
import { clearNotifications, getNotifSettings, setupElectronNavigation, setupPushNavigation, subscribeToPush } from './lib/notifications'
import { startAppVisibilityTracking } from './lib/appVisibility'
import { setNotificationNavigator } from './lib/notificationNavigation'
import { Spinner } from '@/components/ui'
import { LocaleSync } from '@/i18n/LocaleSync'
import { ThemeSync } from '@/components/layout/ThemeSync'
import { LoginPage } from './pages/LoginPage'
import { useAuthStore } from './stores/auth.store'
import { useSettingsStore } from './stores/settings.store'
import { ensureNamespacesLoaded, I18N_NAMESPACES } from '@/i18n/loadBundles'

const Router = isElectron ? HashRouter : BrowserRouter
const MainLayout = lazy(async () => {
  const [module] = await Promise.all([
    import('./components/layout/MainLayout'), ensureNamespacesLoaded(I18N_NAMESPACES)
  ])
  return { default: module.MainLayout }
})
const InboxWorkspace = lazy(async () => {
  await ensureNamespacesLoaded(I18N_NAMESPACES)
  const module = await import('@/components/notifications/InboxWorkspace')
  return { default: module.InboxWorkspace }
})

function AuthenticatedInbox() {
  const authenticated = useAuthStore((s) => s.isAuthenticated)
  return authenticated ? <Suspense fallback={null}><InboxWorkspace /></Suspense> : null
}

const AdminPage = lazy(async () => {
  await ensureNamespacesLoaded(I18N_NAMESPACES)
  return import('./pages/AdminPage').then((m) => ({ default: m.AdminPage }))
})
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage }))
)
const ResetPasswordPage = lazy(() =>
  import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
)

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

function AuthBootstrap() {
  useEffect(() => {
    const boot = () => void useAuthStore.getState().checkAuth()
    if (useAuthStore.persist.hasHydrated()) {
      boot()
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => boot())
      return unsub
    }
  }, [])

  useEffect(() => {
    api.onAuthFailure = () => {
      const store = useAuthStore.getState()
      if (store.isAuthenticated) {
        store.logout().catch(() => {})
      }
    }
    api.onTokenRefresh = (accessToken, refreshToken) => {
      useAuthStore.setState({ accessToken, refreshToken })
    }
    api.onApiError = (err) => {
      showToast('Error', err.message)
    }
    return () => {
      api.onAuthFailure = null
      api.onTokenRefresh = null
      api.onApiError = null
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      const { isAuthenticated, refreshSession } = useAuthStore.getState()
      if (isAuthenticated) {
        void refreshSession().catch(() => {})
      }
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const cleanupPush = setupPushNavigation()
    const cleanupElectron = setupElectronNavigation()
    const cleanupVisibility = startAppVisibilityTracking()
    const preventFileNavigation = (event: DragEvent) => {
      if (
        event.dataTransfer?.files.length &&
        !(event.target instanceof HTMLInputElement && event.target.type === 'file')
      ) {
        event.preventDefault()
      }
    }
    window.addEventListener('drop', preventFileNavigation)
    return () => {
      cleanupPush?.()
      cleanupElectron?.()
      cleanupVisibility()
      window.removeEventListener('drop', preventFileNavigation)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let clearedForMutedAccount: string | undefined
    const sync = () => {
      if (disposed) return
      const state = useAuthStore.getState()
      const mutedAccount = state.isAuthenticated && state.user?.pushSuppressAll ? state.user.id : undefined
      if (mutedAccount && mutedAccount !== clearedForMutedAccount) void clearNotifications(null)
      clearedForMutedAccount = mutedAccount
      // Only re-registers an already-granted permission. Prompting here would be
      // rejected by iOS Safari for lacking a user gesture, permanently burning the
      // one prompt we get; Settings has a button that asks from a real click.
      if (state.isAuthenticated && state.accessToken && getNotifSettings().enabled) {
        subscribeToPush(state.accessToken).catch(() => {})
      }
    }
    const unsub = useAuthStore.subscribe(sync)
    const unsubSettings = useSettingsStore.subscribe((state, previous) => {
      if (state.notifEnabled !== previous.notifEnabled) sync()
    })
    sync()
    // Permission may already be granted before the worker finishes installing.
    if ('serviceWorker' in navigator) void navigator.serviceWorker.ready.then(sync).catch(() => {})
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      disposed = true
      unsub()
      unsubSettings()
      window.removeEventListener('online', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [])

  return null
}

/**
 * Gives out-of-tree notification handlers a real router navigate, so a toast click
 * re-renders in place instead of assigning a hash the router may already be on.
 */
function NotificationRouterBridge() {
  const navigate = useNavigate()
  useEffect(() => {
    setNotificationNavigator((to, options) => navigate(to, options))
    return () => setNotificationNavigator(null)
  }, [navigate])
  return null
}

function LazyFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-surface">
      <Spinner size="lg" />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeSync />
        <DesktopChrome>
          <LocaleSync>
            <AuthBootstrap />
            <NotificationRouterBridge />
            <AuthenticatedInbox />
            <Suspense fallback={<LazyFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <MainLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<RestoreLastLocation />} />
                  <Route path="channels/@me" element={null} />
                  <Route path="channels/@me/:conversationId" element={null} />
                  <Route path="channels/:serverId" element={null} />
                  <Route path="channels/:serverId/:channelId" element={null} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </LocaleSync>
        </DesktopChrome>
      </Router>
    </ErrorBoundary>
  )
}
