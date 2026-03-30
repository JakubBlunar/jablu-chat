import { useState } from 'react'
import { getStoredServerUrl, setStoredServerUrl } from '@/components/settings/ServerUrlScreen'
import { api } from '@/lib/api'
import { electronAPI, isElectron } from '@/lib/electron'

export function ServerConnectionSection() {
  const currentUrl = getStoredServerUrl() ?? ''
  const [url, setUrl] = useState(currentUrl)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSave() {
    setMessage(null)
    const trimmed = url.trim().replace(/\/+$/, '')
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Please enter a server URL.' })
      return
    }
    if (trimmed === currentUrl) {
      setMessage({ type: 'success', text: 'This is already the active server.' })
      return
    }

    setTesting(true)
    try {
      if (electronAPI) {
        const result = await electronAPI.testServerUrl(trimmed)
        if (!result.ok) throw new Error('Server error')
      } else {
        const resp = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(5000) })
        if (!resp.ok) throw new Error('Server error')
      }

      setStoredServerUrl(trimmed)
      if (!isElectron) api.baseUrl = trimmed
      setMessage({ type: 'success', text: 'Server updated. Please log in again to apply the change.' })
    } catch {
      setMessage({ type: 'error', text: 'Could not connect. Check the URL and try again.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-400">
        Change the server your desktop app connects to. You will need to log in again after changing this.
      </p>

      <div>
        <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">SERVER URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.100:3001"
          className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>{message.text}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={testing}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
        >
          {testing ? 'Testing...' : 'Save & Test'}
        </button>
        <button
          type="button"
          onClick={() => setUrl(currentUrl)}
          className="rounded-md bg-white/5 px-5 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
