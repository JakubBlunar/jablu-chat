import { resetPasswordSchema } from '@chat/shared'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { AuthLayout } from '../components/layout/AuthLayout'
import { api } from '../lib/api'

export function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tokenInvalid = !token.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (tokenInvalid) {
      setError(t('invalidOrMissingResetLink'))
      return
    }

    const combined = resetPasswordSchema.safeParse({ token, password })
    if (!combined.success) {
      const issue = combined.error.issues[0]
      setError(issue?.path[0] === 'password' ? t('passwordMinLength') : t('invalidInput'))
      return
    }

    if (password !== confirmPassword) {
      setError(t('passwordsMismatch'))
      return
    }

    setIsSubmitting(true)
    try {
      await api.resetPassword(token, password)
      setSuccess(t('passwordResetSuccess'))
    } catch {
      setError(t('genericError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="mb-2 text-xl font-semibold text-white">{t('newPasswordTitle')}</h2>
      <p className="mb-6 text-sm text-gray-400">{t('newPasswordDescription')}</p>

      {tokenInvalid ? (
        <div
          className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {t('invalidResetLink')}
        </div>
      ) : null}

      {success ? (
        <div className="space-y-4">
          <div
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
            role="status"
          >
            {success}
          </div>
          <Link
            to="/login"
            className="block w-full rounded-md bg-primary py-2.5 text-center text-sm font-semibold text-primary-text transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-dark"
          >
            {t('goToLogin')}
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {error ? (
            <div
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <Input
            id="password"
            label={t('newPasswordTitle')}
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={tokenInvalid}
            className="disabled:cursor-not-allowed"
            placeholder={t('passwordMinPlaceholder')}
            required
          />

          <Input
            id="confirmPassword"
            label={t('confirmPassword')}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={tokenInvalid}
            className="disabled:cursor-not-allowed"
            placeholder={t('confirmPasswordPlaceholder')}
            required
          />

          <Button
            variant="primary"
            size="lg"
            type="submit"
            fullWidth
            className="mt-2"
            disabled={isSubmitting || tokenInvalid}
            loading={isSubmitting}
          >
            {isSubmitting ? t('resetting') : t('resetPassword')}
          </Button>
        </form>
      )}

      <p className="mt-6 text-center text-sm">
        <Link
          to="/login"
          className="font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
        >
          {t('logInLink')}
        </Link>
      </p>
    </AuthLayout>
  )
}
