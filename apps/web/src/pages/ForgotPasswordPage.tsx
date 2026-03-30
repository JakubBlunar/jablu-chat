import { forgotPasswordSchema } from '@chat/shared'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { AuthLayout } from '../components/layout/AuthLayout'
import { ApiError, api } from '../lib/api'

export function ForgotPasswordPage() {
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
      const first = parsed.error.issues[0]?.message ?? 'Invalid input'
      setError(first)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.forgotPassword(parsed.data.email)
      setSuccess(res.message)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <h2 className="mb-2 text-xl font-semibold text-white">Reset your password</h2>
      <p className="mb-6 text-sm text-gray-400">
        Enter your email and we&apos;ll send you a reset link if an account exists.
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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
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
          {isSubmitting ? 'Sending…' : 'Send Reset Link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          to="/login"
          className="font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
        >
          Back to Login
        </Link>
      </p>
    </AuthLayout>
  )
}
