export const AUTH_STORAGE_KEY = 'chat-auth'

export function readPersistedAuth(): {
  accessToken: string | null
  refreshToken: string | null
} {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return { accessToken: null, refreshToken: null }
    const parsed = JSON.parse(raw) as {
      state?: {
        accessToken?: string | null
        refreshToken?: string | null
      }
    }
    return {
      accessToken: parsed.state?.accessToken ?? null,
      refreshToken: parsed.state?.refreshToken ?? null
    }
  } catch {
    return { accessToken: null, refreshToken: null }
  }
}

export function writePersistedAuth(accessToken: string, refreshToken: string) {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    existing.state = {
      ...existing.state,
      accessToken,
      refreshToken
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(existing))
  } catch {
    /* ignore */
  }
}
