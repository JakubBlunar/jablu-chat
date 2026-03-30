import { useState } from 'react'
import { UserAvatar } from '@/components/UserAvatar'
import { SettingsInput } from '@/components/settings/SettingsInput'
import { useAuthStore } from '@/stores/auth.store'

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
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
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
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Change Email'}
      </button>
    </form>
  )
}

export function AccountSection() {
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
            <p className="mb-3 rounded-md bg-black/40 px-2.5 py-0.5 text-lg font-bold text-white backdrop-blur-sm">
              {user?.displayName ?? user?.username}
            </p>
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
