import { lazy, Suspense, useEffect, useState } from "react";
import {
  BrowserRouter,
  HashRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ServerUrlScreen, getStoredServerUrl } from "./components/ServerUrlScreen";
import { UpdateBanner } from "./components/UpdateBanner";
import { isElectron } from "./lib/electron";
import { api } from "./lib/api";
import { migrateSettings } from "./lib/deviceSettings";
import { setupPushNavigation, subscribeToPush } from "./lib/notifications";
import { LoginPage } from "./pages/LoginPage";
import { useAuthStore } from "./stores/auth.store";

const Router = isElectron ? HashRouter : BrowserRouter;

const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));

migrateSettings();

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function AuthBootstrap() {
  useEffect(() => {
    const boot = () => void useAuthStore.getState().checkAuth();
    if (useAuthStore.persist.hasHydrated()) {
      boot();
    } else {
      const unsub = useAuthStore.persist.onFinishHydration(() => boot());
      return unsub;
    }
  }, []);

  useEffect(() => {
    api.onAuthFailure = () => {
      const store = useAuthStore.getState();
      if (store.isAuthenticated) {
        store.logout().catch(() => {});
      }
    };
    return () => {
      api.onAuthFailure = null;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const { isAuthenticated, refreshSession } = useAuthStore.getState();
      if (isAuthenticated) {
        void refreshSession().catch(() => {});
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setupPushNavigation();
  }, []);

  useEffect(() => {
    return useAuthStore.subscribe((state) => {
      if (state.isAuthenticated && state.accessToken) {
        subscribeToPush(state.accessToken).catch(() => {});
      }
    });
  }, []);

  return null;
}

function ElectronUrlGate({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(() => {
    const saved = getStoredServerUrl();
    if (saved) {
      api.baseUrl = saved;
      return true;
    }
    return false;
  });

  if (!isElectron) return <>{children}</>;

  if (!connected) {
    return (
      <ServerUrlScreen
        onConnect={(url) => {
          api.baseUrl = url;
          setConnected(true);
        }}
      />
    );
  }

  return <>{children}</>;
}

function LazyFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-surface">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ElectronUrlGate>
        <UpdateBanner />
        <Router>
          <AuthBootstrap />
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
                <Route index element={<Navigate to="/channels/@me" replace />} />
                <Route path="channels/@me" element={null} />
                <Route path="channels/@me/:conversationId" element={null} />
                <Route path="channels/:serverId" element={null} />
                <Route path="channels/:serverId/:channelId" element={null} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </ElectronUrlGate>
    </ErrorBoundary>
  );
}
