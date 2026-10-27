import { InlineAlert } from '@/components/ui/InlineAlert'
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
      <p className="mb-6 text-sm text-gray-400">{t('resetPasswordDescription')}</p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error ? (
          <InlineAlert variant="error" prominent role="alert">
            {error}
          </InlineAlert>
        ) : null}

        {success ? (
          <InlineAlert variant="success" prominent role="status">
            {success}
          </InlineAlert>
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
