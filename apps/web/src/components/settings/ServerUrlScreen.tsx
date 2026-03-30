import { useState } from 'react'
import { electronAPI } from '@/lib/electron'

const STORAGE_KEY = 'chat:server-url'

export function getStoredServerUrl(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function setStoredServerUrl(url: string) {
  localStorage.setItem(STORAGE_KEY, url)
  electronAPI?.setServerUrl(url).catch(() => {})
}

export function ServerUrlScreen({ onConnect }: { onConnect: (url: string) => void }) {
  const [url, setUrl] = useState(getStoredServerUrl() ?? 'http://')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const trimmed = url.trim().replace(/\/+$/, '')
    if (!trimmed) {
      setError('Please enter a server URL')
      return
    }

    setTesting(true)
    try {
      if (electronAPI) {
        const result = await electronAPI.testServerUrl(trimmed)
        if (!result.ok) throw new Error('Server returned an error')
      } else {
        const resp = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(5000) })
        if (!resp.ok) throw new Error('Server returned an error')
      }

      setStoredServerUrl(trimmed)
      onConnect(trimmed)
    } catch {
      setError('Could not connect to the server. Check the URL and try again.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <form onSubmit={(e) => void handleSubmit(e)} className="w-full max-w-md rounded-lg bg-surface-dark p-8 shadow-xl">
        <h1 className="mb-2 text-center text-2xl font-bold text-white">Connect to Server</h1>
        <p className="mb-6 text-center text-sm text-gray-400">Enter the address of your Jablu server</p>

        <label className="mb-1 block text-xs font-semibold uppercase text-gray-400">Server URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.100:3001"
          className="mb-4 w-full rounded-md bg-surface-darkest px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-primary"
        />

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={testing}
          className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {testing ? 'Connecting...' : 'Connect'}
        </button>

        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY)
            setUrl('http://')
          }}
          className="mt-3 w-full text-center text-xs text-gray-500 hover:text-gray-300"
        >
          Reset saved URL
        </button>
      </form>
    </div>
  )
}
