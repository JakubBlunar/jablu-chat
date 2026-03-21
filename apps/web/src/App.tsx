import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import "./index.css";
import { MainLayout } from "./components/MainLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ServerUrlScreen, getStoredServerUrl } from "./components/ServerUrlScreen";
import { UpdateBanner } from "./components/UpdateBanner";
import { isElectron } from "./lib/electron";
import { api } from "./lib/api";
import { migrateSettings } from "./lib/deviceSettings";
import { AdminPage } from "./pages/AdminPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { MainPage } from "./pages/MainPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { useAuthStore } from "./stores/auth.store";

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

export default function App() {
  return (
    <ElectronUrlGate>
      <UpdateBanner />
      <BrowserRouter>
        <AuthBootstrap />
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
            <Route index element={<MainPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ElectronUrlGate>
  );
}
