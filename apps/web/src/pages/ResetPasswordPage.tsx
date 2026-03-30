import { resetPasswordSchema } from '@chat/shared'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { AuthLayout } from '../components/layout/AuthLayout'
import { ApiError, api } from '../lib/api'

export function ResetPasswordPage() {
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
      setError('Invalid or missing reset link. Request a new reset email.')
      return
    }

    const combined = resetPasswordSchema.safeParse({ token, password })
    if (!combined.success) {
      const first = combined.error.issues[0]?.message ?? 'Invalid input'
      setError(first)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await api.resetPassword(token, password)
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
      <h2 className="mb-2 text-xl font-semibold text-white">New password</h2>
      <p className="mb-6 text-sm text-gray-400">Choose a strong password for your account.</p>

      {tokenInvalid ? (
        <div
          className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          This reset link is invalid or expired. Please request a new one from the forgot password page.
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
            Go to Login
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
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={tokenInvalid}
            className="disabled:cursor-not-allowed"
            placeholder="At least 8 characters"
            required
          />

          <Input
            id="confirmPassword"
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={tokenInvalid}
            className="disabled:cursor-not-allowed"
            placeholder="Repeat password"
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
            {isSubmitting ? 'Resetting…' : 'Reset Password'}
          </Button>
        </form>
      )}

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
