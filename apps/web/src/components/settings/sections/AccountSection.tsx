import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@/components/UserAvatar'
import { Button, Input } from '@/components/ui'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { useAuthStore } from '@/stores/auth.store'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <SectionHeading>{label}</SectionHeading>
      <p className="text-sm text-gray-200">{value}</p>
    </div>
  )
}

function PasswordChangeForm() {
  const { t } = useTranslation('settings')
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
      setError(t('account.passwordMismatch'))
      return
    }
    if (newPassword.length < 8) {
      setError(t('account.passwordTooShort', { count: 8 }))
      return
    }

    setLoading(true)
    try {
      await changePassword({ currentPassword, newPassword })
      setSuccess(t('account.passwordChanged'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('account.passwordChangeFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{t('account.changePassword')}</h3>
      <Input
        label={t('account.currentPassword')}
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <Input
        label={t('account.newPassword')}
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <Input
        label={t('account.confirmNewPassword')}
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? t('account.saving') : t('account.changePassword')}
      </Button>
    </form>
  )
}

function EmailChangeForm() {
  const { t } = useTranslation('settings')
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
      setSuccess(t('account.emailChanged'))
      setEmail('')
      setPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('account.emailChangeFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <h3 className="text-sm font-semibold text-white">{t('account.changeEmail')}</h3>
      <p className="text-xs text-gray-400">
        {t('account.currentEmailLabel')} <span className="text-gray-200">{user?.email}</span>
      </p>
      <Input label={t('account.newEmail')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input
        label={t('account.password')}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('account.confirmPassword')}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">{success}</p>}
      <Button type="submit" variant="primary" disabled={loading}>
        {loading ? t('account.saving') : t('account.changeEmail')}
      </Button>
    </form>
  )
}

export function AccountSection() {
  const { t } = useTranslation('settings')
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
            <InfoRow label={t('account.usernameLabel')} value={user?.username ?? ''} />
            <InfoRow label={t('account.displayNameLabel')} value={user?.displayName ?? user?.username ?? ''} />
            <InfoRow label={t('account.emailLabel')} value={user?.email ?? ''} />
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
