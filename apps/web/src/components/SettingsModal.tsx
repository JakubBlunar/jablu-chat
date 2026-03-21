import type { UserStatus } from "@chat/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/UserAvatar";
import { VoiceSettings } from "@/components/voice/VoiceSettings";
import { api } from "@/lib/api";
import { DownloadAppSection } from "@/components/DownloadApp";
import { electronAPI, isElectron } from "@/lib/electron";
import { getStoredServerUrl, setStoredServerUrl } from "@/components/ServerUrlScreen";
import { useAuthStore } from "@/stores/auth.store";

type Tab = "account" | "profile" | "status" | "voice" | "server" | "downloads";

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: "online", label: "Online", color: "bg-emerald-500" },
  { value: "idle", label: "Idle", color: "bg-amber-400" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-red-500" },
  { value: "offline", label: "Invisible", color: "bg-zinc-500" },
];

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
    </svg>
  );
}

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("account");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "downloads") {
        setTab("downloads");
      }
    };
    window.addEventListener("open-settings", handler);
    return () => window.removeEventListener("open-settings", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex bg-surface">
      {/* Left sidebar */}
      <div className="flex w-56 shrink-0 flex-col items-end bg-surface-dark">
        <nav className="w-44 space-y-0.5 px-2 py-16">
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-gray-400">
            USER SETTINGS
          </p>
          <SidebarButton
            active={tab === "account"}
            onClick={() => setTab("account")}
          >
            My Account
          </SidebarButton>
          <SidebarButton
            active={tab === "profile"}
            onClick={() => setTab("profile")}
          >
            Profile
          </SidebarButton>
          <SidebarButton
            active={tab === "status"}
            onClick={() => setTab("status")}
          >
            Status
          </SidebarButton>
          <SidebarButton
            active={tab === "voice"}
            onClick={() => setTab("voice")}
          >
            Voice & Video
          </SidebarButton>
          {isElectron && (
            <SidebarButton
              active={tab === "server"}
              onClick={() => setTab("server")}
            >
              Server Connection
            </SidebarButton>
          )}
          {!isElectron && (
            <SidebarButton
              active={tab === "downloads"}
              onClick={() => setTab("downloads")}
            >
              Desktop App
            </SidebarButton>
          )}
          <div className="my-2 border-t border-white/10" />
          <LogOutButton onClose={onClose} />
          {isElectron && electronAPI && (
            <div className="mt-4 border-t border-white/10 pt-4 px-2">
              <AppVersionInfo />
            </div>
          )}
        </nav>
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[660px] px-10 py-16">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">
              {tab === "account"
                ? "My Account"
                : tab === "profile"
                  ? "Profile"
                  : tab === "voice"
                    ? "Voice & Video"
                    : tab === "server"
                      ? "Server Connection"
                      : tab === "downloads"
                        ? "Desktop App"
                        : "Status"}
            </h1>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-6">
            {tab === "account" && <AccountSection />}
            {tab === "profile" && <ProfileSection />}
            {tab === "status" && <StatusSection />}
            {tab === "voice" && <VoiceSettings />}
            {tab === "server" && <ServerConnectionSection />}
            {tab === "downloads" && <DownloadAppSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
        active
          ? "bg-white/10 text-white"
          : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function LogOutButton({ onClose }: { onClose: () => void }) {
  const logout = useAuthStore((s) => s.logout);
  return (
    <button
      type="button"
      onClick={() => {
        onClose();
        void logout();
      }}
      className="block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
    >
      Log Out
    </button>
  );
}

/* ────────────────────────────── Account Section ────────────────────────────── */

function AccountSection() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      {/* Account card */}
      <div className="overflow-hidden rounded-lg bg-surface-darkest">
        <div className="h-24 bg-primary" />
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="rounded-full border-[6px] border-surface-darkest">
              <UserAvatar
                username={user?.username ?? ""}
                avatarUrl={user?.avatarUrl}
                size="lg"
              />
            </div>
            <p className="mb-1 text-lg font-bold text-white">
              {user?.username}
            </p>
          </div>
          <div className="mt-4 space-y-3 rounded-lg bg-surface-dark p-4">
            <InfoRow label="USERNAME" value={user?.username ?? ""} />
            <InfoRow label="EMAIL" value={user?.email ?? ""} />
          </div>
        </div>
      </div>

      {/* Password */}
      <PasswordChangeForm />

      {/* Email */}
      <EmailChangeForm />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-gray-400">
        {label}
      </p>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  );
}

function PasswordChangeForm() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setSuccess("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Change Password</h3>
      <SettingsInput
        label="Current Password"
        type="password"
        value={currentPassword}
        onChange={setCurrentPassword}
      />
      <SettingsInput
        label="New Password"
        type="password"
        value={newPassword}
        onChange={setNewPassword}
      />
      <SettingsInput
        label="Confirm New Password"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? "Saving..." : "Change Password"}
      </button>
    </form>
  );
}

function EmailChangeForm() {
  const user = useAuthStore((s) => s.user);
  const changeEmail = useAuthStore((s) => s.changeEmail);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await changeEmail({ email, password });
      setSuccess("Email changed successfully");
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to change email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Change Email</h3>
      <p className="text-xs text-gray-400">
        Current: <span className="text-gray-200">{user?.email}</span>
      </p>
      <SettingsInput
        label="New Email"
        type="email"
        value={email}
        onChange={setEmail}
      />
      <SettingsInput
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Confirm your password"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? "Saving..." : "Change Email"}
      </button>
    </form>
  );
}

/* ────────────────────────────── Profile Section ────────────────────────────── */

function ProfileSection() {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar);
  const deleteAvatar = useAuthStore((s) => s.deleteAvatar);

  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await uploadAvatar(file);
      } catch (err: any) {
        setError(err?.message ?? "Failed to upload avatar");
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [uploadAvatar],
  );

  const handleDeleteAvatar = useCallback(async () => {
    try {
      await deleteAvatar();
    } catch (err: any) {
      setError(err?.message ?? "Failed to remove avatar");
    }
  }, [deleteAvatar]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data: Record<string, string> = {};
      if (username !== user?.username) data.username = username;
      if (bio !== (user?.bio ?? "")) data.bio = bio;
      if (Object.keys(data).length > 0) {
        await updateProfile(data);
      }
      setSuccess("Profile updated");
    } catch (err: any) {
      setError(err?.message ?? "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="group relative">
          <UserAvatar
            username={user?.username ?? ""}
            avatarUrl={user?.avatarUrl}
            size="xl"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            title="Change avatar"
          >
            <CameraIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-primary transition hover:underline"
          >
            Change Avatar
          </button>
          {user?.avatarUrl && (
            <button
              type="button"
              onClick={handleDeleteAvatar}
              className="block text-sm text-gray-400 transition hover:text-red-400"
            >
              Remove Avatar
            </button>
          )}
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={handleSave} className="space-y-3">
        <SettingsInput
          label="Username"
          value={username}
          onChange={setUsername}
        />
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">
            BIO
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
            className="w-full resize-none rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-primary"
          />
          <p className="mt-0.5 text-right text-xs text-gray-500">
            {bio.length}/190
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

/* ────────────────────────────── Status Section ────────────────────────────── */

function StatusSection() {
  const user = useAuthStore((s) => s.user);
  const updateStatus = useAuthStore((s) => s.updateStatus);
  const [loading, setLoading] = useState<UserStatus | null>(null);

  const currentStatus = user?.status ?? "online";

  const handleChange = async (status: UserStatus) => {
    setLoading(status);
    try {
      await updateStatus(status);
    } catch {
      // ignore
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400">
        Choose how others see you in the member list.
      </p>
      <div className="space-y-1">
        {STATUS_OPTIONS.map((opt) => {
          const active = currentStatus === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={loading !== null}
              onClick={() => handleChange(opt.value)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-gray-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full ${opt.color}`}
              />
              <span className="text-sm font-medium">{opt.label}</span>
              {active && (
                <span className="ml-auto text-xs text-gray-400">Current</span>
              )}
              {loading === opt.value && (
                <span className="ml-auto text-xs text-gray-400">...</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────── Server Connection ─────────────────────────── */

function ServerConnectionSection() {
  const currentUrl = getStoredServerUrl() ?? "";
  const [url, setUrl] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    setMessage(null);
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter a server URL." });
      return;
    }
    if (trimmed === currentUrl) {
      setMessage({ type: "success", text: "This is already the active server." });
      return;
    }

    setTesting(true);
    try {
      const resp = await fetch(`${trimmed}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error("Server error");

      setStoredServerUrl(trimmed);
      api.baseUrl = trimmed;
      setMessage({ type: "success", text: "Server updated. Please log in again to apply the change." });
    } catch {
      setMessage({ type: "error", text: "Could not connect. Check the URL and try again." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Change the server your desktop app connects to. You will need to log in again after changing this.
      </p>

      <div>
        <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">
          SERVER URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.100:3001"
          className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message.text}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={testing}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {testing ? "Testing..." : "Save & Test"}
        </button>
        <button
          type="button"
          onClick={() => setUrl(currentUrl)}
          className="rounded-md bg-white/5 px-5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────── App Version ────────────────────────────── */

function AppVersionInfo() {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!electronAPI) return;
    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setChecking(false);
        setStatus(`Update ${info.version} available, downloading...`);
      }),
      electronAPI.onUpdateNotAvailable(() => {
        setChecking(false);
        setStatus("You're up to date!");
        setTimeout(() => setStatus(null), 3000);
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setStatus(`Update ${info.version} ready — restart to install`);
      }),
      electronAPI.onUpdateError(() => {
        setChecking(false);
        setStatus("Update check failed");
        setTimeout(() => setStatus(null), 3000);
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleCheck = () => {
    setChecking(true);
    setStatus(null);
    electronAPI?.checkForUpdates().catch(() => setChecking(false));
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500">
        Nook v{electronAPI?.appVersion ?? "?"}
      </p>
      <button
        type="button"
        onClick={handleCheck}
        disabled={checking}
        className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
      >
        {checking ? "Checking..." : "Check for updates"}
      </button>
      {status && (
        <p className="text-[11px] text-gray-400">{status}</p>
      )}
    </div>
  );
}

/* ────────────────────────────── Shared Input ────────────────────────────── */

function SettingsInput({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">
        {label.toUpperCase()}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
      />
    </div>
  );
}
