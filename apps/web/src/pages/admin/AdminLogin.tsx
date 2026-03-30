import { useEffect, useState } from 'react'
import { setStoredToken } from './adminApi'
import { formatRetryTime } from './adminFormatters'

export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const id = setInterval(() => {
      setLockoutSeconds((s) => {
        if (s <= 1) return 0
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [lockoutSeconds > 0])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lockoutSeconds > 0) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const data = (await res.json()) as {
        ok: boolean
        token?: string
        retryAfter?: number
      }
      if (data.ok && data.token) {
        setStoredToken(data.token)
        onLogin()
      } else {
        if (data.retryAfter) {
          setLockoutSeconds(data.retryAfter)
          setError(`Too many failed attempts. Try again in ${formatRetryTime(data.retryAfter)}.`)
        } else {
          setError('Invalid credentials')
        }
      }
    } catch {
      setError('Connection failed')
    } finally {
      setBusy(false)
    }
  }

  const isLocked = lockoutSeconds > 0

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-darkest p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-sm rounded-lg bg-surface-dark p-8 shadow-2xl ring-1 ring-white/10"
      >
        <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
        <p className="mt-2 text-sm text-gray-400">Enter your superadmin credentials to continue.</p>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          autoFocus
          disabled={isLocked}
          className="mt-5 w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          disabled={isLocked}
          className="mt-3 w-full rounded-md bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        {isLocked && <p className="mt-1 text-xs text-gray-500">Locked for {formatRetryTime(lockoutSeconds)}</p>}
        <button
          type="submit"
          disabled={busy || !username || !password || isLocked}
          className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? 'Checking…' : isLocked ? 'Locked' : 'Login'}
        </button>
      </form>
    </div>
  )
}
