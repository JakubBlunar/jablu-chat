const ADMIN_TOKEN_KEY = 'chat-admin-token'

export function getStoredToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? ''
}

export function setStoredToken(token: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearStoredToken() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY)
}

export async function adminFetch<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const token = getStoredToken()
  const res = await fetch(path, {
    method: opts?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
