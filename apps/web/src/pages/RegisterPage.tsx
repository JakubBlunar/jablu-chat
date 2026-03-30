import { registerSchema } from '@chat/shared'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { AuthLayout } from '../components/layout/AuthLayout'
import { api, ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'

export function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const register = useAuthStore((s) => s.register)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteCode, setInviteCode] = useState(() => searchParams.get('code') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [regMode, setRegMode] = useState<'open' | 'invite'>('open')

  useEffect(() => {
    api
      .getRegistrationMode()
      .then((r) => {
        if (r.mode === 'invite') setRegMode('invite')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isAuthLoading, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (regMode === 'invite' && !inviteCode.trim()) {
      setError('An invite code is required to register')
      return
    }

    const parsed = registerSchema.safeParse({ username, email, password })
    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? 'Invalid input'
      setError(first)
      return
    }

    setIsSubmitting(true)
    try {
      await register(
        parsed.data.username,
        parsed.data.email,
        parsed.data.password,
        regMode === 'invite' ? inviteCode.trim() : undefined
      )
      navigate('/', { replace: true })
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

  if (isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-auth-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
        <span className="sr-only">Checking session</span>
      </div>
    )
  }

  return (
    <AuthLayout>
      <h2 className="mb-6 text-xl font-semibold text-white">Create an account</h2>

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
          id="username"
          label="Username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          maxLength={20}
          placeholder="cool_nickname"
          required
        />

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

        <Input
          id="password"
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />

        <Input
          id="confirmPassword"
          label="Confirm Password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your password"
          required
        />

        {regMode === 'invite' && (
          <div className="space-y-1.5">
            <Input
              id="inviteCode"
              label="Invite Code"
              name="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest"
              placeholder="XXXXXXXX"
              required
            />
            <p className="text-xs text-gray-500">Enter the code you received from an administrator.</p>
          </div>
        )}

        <Button
          variant="primary"
          size="lg"
          type="submit"
          fullWidth
          className="mt-2"
          disabled={isSubmitting}
          loading={isSubmitting}
        >
          {isSubmitting ? 'Creating account…' : 'Create Account'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        Already have an account?{' '}
        <Link
          to="/login"
          className="font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
        >
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
