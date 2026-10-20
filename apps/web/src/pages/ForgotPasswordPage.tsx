import { forgotPasswordSchema } from '@chat/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { AuthLayout } from '../components/layout/AuthLayout'
import { api } from '../lib/api'

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const parsed = forgotPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      setError(t('invalidEmail'))
      return
    }

    setIsSubmitting(true)
    try {
      await api.forgotPassword(parsed.data.email)
      setSuccess(t('forgotPasswordSuccess'))
    } catch {
      setError(t('genericError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="mb-2 text-xl font-semibold text-white">{t('resetPasswordTitle')}</h2>
      <p className="mb-6 text-sm text-gray-400">
        {t('resetPasswordDescription')}
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error ? (
          <div
            className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        {success ? (
          <div
            className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
            role="status"
          >
            {success}
          </div>
        ) : null}

        <Input
          id="email"
          label={t('email')}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          required
        />

        <Button
          variant="primary"
          size="lg"
          type="submit"
          fullWidth
          className="mt-2"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? t('sending') : t('sendResetLink')}
        </Button>
      </form>

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
