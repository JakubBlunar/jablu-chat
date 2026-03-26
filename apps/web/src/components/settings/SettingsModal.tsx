import type { DmPrivacy, UserStatus } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useIsMobile } from '@/hooks/useMobile'
import SimpleBar from 'simplebar-react'
import { UserAvatar } from '@/components/UserAvatar'
import { VoiceSettings } from '@/components/voice/VoiceSettings'
import { api, type ActiveSession } from '@/lib/api'
import { DownloadAppSection } from '@/components/settings/DownloadApp'
import { PwaInstallGuide } from '@/components/PwaInstallGuide'
import { electronAPI, isElectron } from '@/lib/electron'
import { getIsStandalone } from '@/hooks/usePwaInstall'
import {
  getNotifSettings,
  saveNotifSettings,
  requestPermission,
  subscribeToPush,
  unsubscribeFromPush
} from '@/lib/notifications'
import { getStoredServerUrl, setStoredServerUrl } from '@/components/settings/ServerUrlScreen'
import { useAuthStore } from '@/stores/auth.store'

type Tab =
  | 'account'
  | 'profile'
  | 'status'
  | 'privacy'
  | 'voice'
  | 'notifications'
  | 'sessions'
  | 'server'
  | 'desktop'
  | 'downloads'
  | 'install'

const STATUS_OPTIONS: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online', label: 'Online', color: 'bg-emerald-500' },
  { value: 'idle', label: 'Idle', color: 'bg-amber-400' },
  { value: 'dnd', label: 'Do Not Disturb', color: 'bg-red-500' },
  { value: 'offline', label: 'Invisible', color: 'bg-zinc-500' }
]

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
    </svg>
  )
}

export function SettingsModal({ open, onClose, initialTab }: { open: boolean; onClose: () => void; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'account')
  const modalRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  useFocusTrap(modalRef, open)

  useEffect(() => {
    if (initialTab) setTab(initialTab as Tab)
  }, [initialTab])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const tabEntries: { key: Tab; label: string; show?: boolean }[] = [
    { key: 'account', label: 'My Account' },
    { key: 'profile', label: 'Profile' },
    { key: 'status', label: 'Status' },
    { key: 'privacy', label: 'Privacy' },
    { key: 'voice', label: 'Voice & Video' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'server', label: 'Server Connection', show: isElectron },
    { key: 'desktop', label: 'Desktop App', show: isElectron },
    { key: 'downloads', label: 'Desktop App', show: !isElectron && !isMobile },
    { key: 'install', label: 'Install App', show: !isElectron && !getIsStandalone() }
  ]

  const visibleTabs = tabEntries.filter((t) => t.show !== false)
  const currentLabel = visibleTabs.find((t) => t.key === tab)?.label ?? 'Settings'

  const settingsContent = (
    <>
      {tab === 'account' && <AccountSection />}
      {tab === 'profile' && <ProfileSection />}
      {tab === 'status' && <StatusSection />}
      {tab === 'privacy' && <PrivacySection />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'notifications' && <NotificationsSection />}
      {tab === 'sessions' && <ActiveSessionsSection />}
      {tab === 'server' && <ServerConnectionSection />}
      {tab === 'desktop' && <DesktopAppSection />}
      {tab === 'downloads' && <DownloadAppSection />}
      {tab === 'install' && <PwaInstallGuide />}
    </>
  )

  if (isMobile) {
    return (
      <div ref={modalRef} className="fixed inset-0 z-[100] flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ml-2 text-base font-semibold text-white">{currentLabel}</h1>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-white/10 scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  tab === t.key ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
            <LogOutButton onClose={onClose} mobile />
          </div>
        </div>
        <SimpleBar className="min-h-0 flex-1">
          <div className="px-4 py-6">{settingsContent}</div>
        </SimpleBar>
      </div>
    )
  }

  return (
    <div ref={modalRef} className="fixed inset-0 z-[100] flex bg-surface" role="dialog" aria-modal="true" aria-label="Settings">
      {/* Left sidebar */}
      <div className="flex w-56 shrink-0 flex-col items-end bg-surface-dark">
        <nav className="w-44 space-y-0.5 px-2 py-16">
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-gray-400">USER SETTINGS</p>
          {visibleTabs.map((t) => (
            <SidebarButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </SidebarButton>
          ))}
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
      <SimpleBar className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[660px] px-10 py-16">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">{currentLabel}</h1>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-6">{settingsContent}</div>
        </div>
      </SimpleBar>
    </div>
  )
}

function SidebarButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
        active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function LogOutButton({ onClose, mobile }: { onClose: () => void; mobile?: boolean }) {
  const logout = useAuthStore((s) => s.logout)
  return (
    <button
      type="button"
      onClick={() => {
        onClose()
        void logout()
      }}
      className={
        mobile
          ? 'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300'
          : 'block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300'
      }
    >
      Log Out
    </button>
  )
}

/* ────────────────────────────── Account Section ────────────────────────────── */

function AccountSection() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6">
      {/* Account card */}
      <div className="overflow-hidden rounded-lg bg-surface-darkest">
        <div className="h-24 bg-primary" />
        <div className="px-4 pb-4">
          <div className="-mt-10 flex items-end gap-3">
            <div className="rounded-full border-[6px] border-surface-darkest">
              <UserAvatar username={user?.username ?? ''} avatarUrl={user?.avatarUrl} size="lg" />
            </div>
            <p className="mb-3 text-lg font-bold text-white">{user?.displayName ?? user?.username}</p>
          </div>
          <div className="mt-4 space-y-3 rounded-lg bg-surface-dark p-4">
            <InfoRow label="USERNAME" value={user?.username ?? ''} />
            <InfoRow label="DISPLAY NAME" value={user?.displayName ?? user?.username ?? ''} />
            <InfoRow label="EMAIL" value={user?.email ?? ''} />
          </div>
        </div>
      </div>

      {/* Password */}
      <PasswordChangeForm />

      {/* Email */}
      <EmailChangeForm />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  )
}

function PasswordChangeForm() {
  const changePassword = useAuthStore((s) => s.changePassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setSuccess('Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Change Password</h3>
      <SettingsInput label="Current Password" type="password" value={currentPassword} onChange={setCurrentPassword} />
      <SettingsInput label="New Password" type="password" value={newPassword} onChange={setNewPassword} />
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
        {loading ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  )
}

function EmailChangeForm() {
  const user = useAuthStore((s) => s.user)
  const changeEmail = useAuthStore((s) => s.changeEmail)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      await changeEmail({ email, password })
      setSuccess('Email changed successfully')
      setEmail('')
      setPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to change email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">Change Email</h3>
      <p className="text-xs text-gray-400">
        Current: <span className="text-gray-200">{user?.email}</span>
      </p>
      <SettingsInput label="New Email" type="email" value={email} onChange={setEmail} />
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
        {loading ? 'Saving...' : 'Change Email'}
      </button>
    </form>
  )
}

/* ────────────────────────────── Profile Section ────────────────────────────── */

function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar)
  const deleteAvatar = useAuthStore((s) => s.deleteAvatar)

  const [displayName, setDisplayName] = useState(user?.displayName ?? user?.username ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        await uploadAvatar(file)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to upload avatar')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [uploadAvatar]
  )

  const handleDeleteAvatar = useCallback(async () => {
    try {
      await deleteAvatar()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar')
    }
  }, [deleteAvatar])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const data: Record<string, string> = {}
      if (displayName !== (user?.displayName ?? user?.username ?? '')) data.displayName = displayName
      if (bio !== (user?.bio ?? '')) data.bio = bio
      if (Object.keys(data).length > 0) {
        await updateProfile(data)
      }
      setSuccess('Profile updated')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="group relative">
          <UserAvatar username={user?.username ?? ''} avatarUrl={user?.avatarUrl} size="xl" />
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
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">USERNAME</label>
          <div className="w-full rounded-md border border-surface-darkest bg-surface-darkest/50 px-3 py-2 text-sm text-gray-500">
            {user?.username}
          </div>
        </div>
        <SettingsInput label="Display Name" value={displayName} onChange={setDisplayName} maxLength={20} />
        <div>
          <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">BIO</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
            className="w-full resize-none rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition focus:border-primary"
          />
          <p className="mt-0.5 text-right text-xs text-gray-500">{bio.length}/190</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}

/* ────────────────────────────── Status Section ────────────────────────────── */

function StatusSection() {
  const user = useAuthStore((s) => s.user)
  const updateStatus = useAuthStore((s) => s.updateStatus)
  const [loading, setLoading] = useState<UserStatus | null>(null)

  const currentStatus = user?.status ?? 'online'

  const handleChange = async (status: UserStatus) => {
    setLoading(status)
    try {
      await updateStatus(status)
    } catch {
      // ignore
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-400">Choose how others see you in the member list.</p>
      <div className="space-y-1">
        {STATUS_OPTIONS.map((opt) => {
          const active = currentStatus === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={loading !== null}
              onClick={() => handleChange(opt.value)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              <span className={`inline-block h-3 w-3 rounded-full ${opt.color}`} />
              <span className="text-sm font-medium">{opt.label}</span>
              {active && <span className="ml-auto text-xs text-gray-400">Current</span>}
              {loading === opt.value && <span className="ml-auto text-xs text-gray-400">...</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ────────────────────────────── Privacy Section ────────────────────────────── */

function PrivacySection() {
  const user = useAuthStore((s) => s.user)
  const updateDmPrivacy = useAuthStore((s) => s.updateDmPrivacy)
  const [loading, setLoading] = useState(false)

  const current: DmPrivacy = user?.dmPrivacy ?? 'everyone'

  const handleToggle = async () => {
    const next: DmPrivacy = current === 'everyone' ? 'friends_only' : 'everyone'
    setLoading(true)
    try {
      await updateDmPrivacy(next)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Control who can send you direct messages.</p>

      <div className="space-y-3">
        <div className={loading ? 'pointer-events-none opacity-60' : ''}>
          <ToggleRow
            label="Friends Only DMs"
            description="Only allow friends to start new direct message conversations with you"
            checked={current === 'friends_only'}
            onChange={() => void handleToggle()}
          />
        </div>
        {current === 'friends_only' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300">
              Non-friends will not be able to find you or start new conversations with you. Existing conversations will not be affected.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── Notifications ──────────────────────────── */

function NotificationsSection() {
  const [settings, setSettings] = useState(getNotifSettings)
  const [permStatus, setPermStatus] = useState<string>(
    'Notification' in window ? Notification.permission : 'unsupported'
  )
  const [pushStatus, setPushStatus] = useState<'checking' | 'active' | 'inactive' | 'error'>('checking')
  const [pushError, setPushError] = useState<string | null>(null)
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('inactive')
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushStatus(sub ? 'active' : 'inactive'))
      .catch(() => setPushStatus('error'))
  }, [])

  const toggle = async (key: 'enabled' | 'soundEnabled') => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    saveNotifSettings(next)

    if (key === 'enabled' && accessToken) {
      if (!next.enabled) {
        try {
          await unsubscribeFromPush(accessToken)
          setPushStatus('inactive')
        } catch {
          /* non-critical */
        }
      } else if (permStatus === 'granted') {
        try {
          await subscribeToPush(accessToken)
          const reg = await navigator.serviceWorker.ready
          const sub = await reg.pushManager.getSubscription()
          setPushStatus(sub ? 'active' : 'inactive')
        } catch {
          /* non-critical */
        }
      }
    }
  }

  const handleRequestPermission = async () => {
    const granted = await requestPermission()
    setPermStatus(granted ? 'granted' : 'denied')
    if (granted && accessToken) {
      try {
        await subscribeToPush(accessToken)
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setPushStatus(sub ? 'active' : 'error')
        setPushError(sub ? null : 'Push subscription failed. See troubleshooting below.')
      } catch (e: any) {
        setPushStatus('error')
        setPushError(e?.message ?? 'Push subscription failed')
      }
    }
  }

  const handleEnablePush = async () => {
    if (!accessToken) return
    setPushError(null)
    try {
      await subscribeToPush(accessToken)
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setPushStatus(sub ? 'active' : 'error')
      if (!sub) setPushError('Push subscription failed. See troubleshooting below.')
    } catch (e: any) {
      setPushStatus('error')
      setPushError(e?.message ?? 'Push subscription failed')
    }
  }

  const isBrave = 'brave' in navigator

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">Control how Jablu notifies you about new messages.</p>

      {permStatus !== 'granted' && permStatus !== 'unsupported' && (
        <div className="rounded-lg bg-surface-dark p-4">
          <p className="text-sm text-gray-300">
            Browser notifications are {permStatus === 'denied' ? 'blocked' : 'not enabled'}.
          </p>
          {permStatus !== 'denied' && (
            <button
              type="button"
              onClick={() => void handleRequestPermission()}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
            >
              Enable Notifications
            </button>
          )}
          {permStatus === 'denied' && (
            <p className="mt-1 text-xs text-gray-500">
              You have blocked notifications for this site. Update your browser settings to allow them.
            </p>
          )}
        </div>
      )}

      {permStatus === 'granted' && (
        <div className="rounded-lg bg-surface-dark p-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                pushStatus === 'active'
                  ? 'bg-green-500'
                  : pushStatus === 'error'
                    ? 'bg-red-500'
                    : pushStatus === 'inactive'
                      ? 'bg-yellow-500'
                      : 'bg-gray-500'
              }`}
            />
            <p className="text-sm font-medium text-gray-200">
              {pushStatus === 'active'
                ? 'Push notifications are active'
                : pushStatus === 'checking'
                  ? 'Checking push status...'
                  : 'Push notifications are not active'}
            </p>
          </div>
          {pushStatus === 'active' && (
            <p className="mt-1 text-xs text-gray-500">You will receive notifications even when the app is closed.</p>
          )}
          {(pushStatus === 'inactive' || pushStatus === 'error') && (
            <>
              <button
                type="button"
                onClick={() => void handleEnablePush()}
                className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
              >
                Enable Push Notifications
              </button>
              {pushError && <p className="mt-2 text-xs text-red-400">{pushError}</p>}
            </>
          )}
        </div>
      )}

      {permStatus === 'granted' && pushStatus !== 'active' && pushStatus !== 'checking' && (
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
          <p className="text-sm font-medium text-yellow-400">Troubleshooting</p>
          <ul className="mt-2 space-y-1.5 text-xs text-gray-400">
            {isBrave && (
              <li>
                <strong className="text-gray-300">Brave Browser:</strong> Go to{' '}
                <span className="rounded bg-surface-darkest px-1.5 py-0.5 font-mono text-gray-300">
                  brave://settings/privacy
                </span>{' '}
                and enable <strong className="text-gray-300">"Use Google services for push messaging"</strong>. This is
                required for push notifications to work.
              </li>
            )}
            <li>Make sure notifications are allowed in your operating system settings for this browser.</li>
            <li>If you are using a VPN or firewall, ensure it does not block push service connections.</li>
            <li>Try closing all tabs and reopening the app, then click "Enable Push Notifications" again.</li>
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <ToggleRow
          label="Notifications"
          description="Show notifications when you receive new messages"
          checked={settings.enabled}
          onChange={() => toggle('enabled')}
        />
        <ToggleRow
          label="Notification Sound"
          description="Play a sound when you receive a notification"
          checked={settings.soundEnabled}
          onChange={() => toggle('soundEnabled')}
        />
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-dark px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-primary' : 'bg-gray-600'}`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

/* ────────────────────────── Active Sessions ─────────────────────────── */

function parseUA(ua: string | null): string {
  if (!ua) return 'Unknown device'
  const browser =
    ua.match(/Edg\/([\d.]+)/)?.[0]?.replace('Edg', 'Edge') ??
    ua.match(/Chrome\/([\d.]+)/)?.[0] ??
    ua.match(/Firefox\/([\d.]+)/)?.[0] ??
    ua.match(/Safari\/([\d.]+)/)?.[0] ??
    'Browser'
  const os =
    ua.match(/Windows NT [\d.]+/)?.[0]?.replace('Windows NT 10.0', 'Windows') ??
    ua.match(/Mac OS X [\d._]+/)?.[0]?.replace(/_/g, '.') ??
    ua.match(/Linux/)?.[0] ??
    ua.match(/Android [\d.]+/)?.[0] ??
    ua.match(/iPhone OS [\d_]+/)?.[0]?.replace(/_/g, '.') ??
    ''
  return `${browser} on ${os || 'Unknown OS'}`
}

function formatSessionDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function ActiveSessionsSection() {
  const [sessions, setSessions] = useState<ActiveSession[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .getSessions()
      .then((data) => {
        if (!cancelled) setSessions(data)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load sessions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleRevoke = async (id: string) => {
    setRevoking(id)
    try {
      await api.revokeSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setError('Failed to revoke session')
    } finally {
      setRevoking(null)
    }
  }

  const handleRevokeAll = async () => {
    setRevoking('all')
    try {
      const rt = useAuthStore.getState().refreshToken
      await api.revokeAllSessions(rt ?? '')
      setSessions((prev) => prev.slice(0, 1))
    } catch {
      setError('Failed to revoke sessions')
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">
        Devices where your account is currently logged in. Revoke sessions you don't recognize.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sessions.length > 1 && (
        <button
          type="button"
          onClick={() => void handleRevokeAll()}
          disabled={revoking !== null}
          className="rounded-md bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {revoking === 'all' ? 'Revoking...' : 'Revoke All Other Sessions'}
        </button>
      )}

      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 rounded-lg bg-surface-dark px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">
                {parseUA(s.userAgent)}
                {i === 0 && (
                  <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    Current
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400">
                {s.ipAddress ?? 'Unknown IP'} · Last used {formatSessionDate(s.lastUsedAt)}
              </p>
            </div>
            {i !== 0 && (
              <button
                type="button"
                onClick={() => void handleRevoke(s.id)}
                disabled={revoking !== null}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                {revoking === s.id ? '...' : 'Revoke'}
              </button>
            )}
          </div>
        ))}

        {sessions.length === 0 && <p className="py-4 text-center text-sm text-gray-500">No active sessions found.</p>}
      </div>
    </div>
  )
}

/* ────────────────────────── Server Connection ─────────────────────────── */

function DesktopAppSection() {
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    electronAPI
      ?.getAutoLaunch()
      .then((v) => setAutoLaunch(v))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async () => {
    if (!electronAPI) return
    const next = !autoLaunch
    try {
      const result = await electronAPI.setAutoLaunch(next)
      setAutoLaunch(result)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Startup</h3>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleToggle()}
          className="flex w-full items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
        >
          <div
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${autoLaunch ? 'bg-primary' : 'bg-white/10'}`}
          >
            <div
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                autoLaunch ? 'translate-x-5' : ''
              }`}
            />
          </div>
          <div className="text-left">
            <span className="block text-sm text-gray-200">Start at login</span>
            <span className="block text-[11px] text-gray-500">
              Automatically start Jablu when you log in to your computer
            </span>
          </div>
        </button>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-200">System Tray</h3>
        <div className="rounded-md bg-surface-darkest px-4 py-3">
          <p className="text-sm text-gray-300">
            Jablu minimizes to the system tray when you close the window.
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            Double-click the tray icon to reopen. Right-click for options including Quit.
          </p>
        </div>
      </div>
    </div>
  )
}

function ServerConnectionSection() {
  const currentUrl = getStoredServerUrl() ?? ''
  const [url, setUrl] = useState(currentUrl)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSave() {
    setMessage(null)
    const trimmed = url.trim().replace(/\/+$/, '')
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Please enter a server URL.' })
      return
    }
    if (trimmed === currentUrl) {
      setMessage({ type: 'success', text: 'This is already the active server.' })
      return
    }

    setTesting(true)
    try {
      const resp = await fetch(`${trimmed}/api/health`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!resp.ok) throw new Error('Server error')

      setStoredServerUrl(trimmed)
      api.baseUrl = trimmed
      setMessage({ type: 'success', text: 'Server updated. Please log in again to apply the change.' })
    } catch {
      setMessage({ type: 'error', text: 'Could not connect. Check the URL and try again.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Change the server your desktop app connects to. You will need to log in again after changing this.
      </p>

      <div>
        <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">SERVER URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.100:3001"
          className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{message.text}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={testing}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Save & Test'}
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
  )
}

/* ────────────────────────────── App Version ────────────────────────────── */

function AppVersionInfo() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    if (!electronAPI) return
    const unsubs = [
      electronAPI.onUpdateAvailable((info) => {
        setChecking(false)
        setStatus(`Update ${info.version} available, downloading...`)
      }),
      electronAPI.onUpdateNotAvailable(() => {
        setChecking(false)
        setStatus("You're up to date!")
        setTimeout(() => setStatus(null), 3000)
      }),
      electronAPI.onUpdateDownloaded((info) => {
        setStatus(`Update ${info.version} ready — restart to install`)
      }),
      electronAPI.onUpdateError(() => {
        setChecking(false)
        setStatus('Update check failed')
        setTimeout(() => setStatus(null), 3000)
      })
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [])

  const handleCheck = () => {
    setChecking(true)
    setStatus(null)
    electronAPI?.checkForUpdates().catch(() => setChecking(false))
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-gray-500">Jablu v{electronAPI?.appVersion ?? '?'}</p>
      <button
        type="button"
        onClick={handleCheck}
        disabled={checking}
        className="text-xs text-gray-400 transition hover:text-white disabled:opacity-50"
      >
        {checking ? 'Checking...' : 'Check for updates'}
      </button>
      {status && <p className="text-[11px] text-gray-400">{status}</p>}
    </div>
  )
}

/* ────────────────────────────── Shared Input ────────────────────────────── */

function SettingsInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  maxLength
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
      />
    </div>
  )
}
