import { ApiClient } from './client'
import { ApiError } from './errors'

jest.mock('./auth-storage', () => ({
  readPersistedAuth: jest.fn().mockReturnValue({ accessToken: 'tok123', refreshToken: 'ref456' }),
  writePersistedAuth: jest.fn()
}))

import { readPersistedAuth, writePersistedAuth } from './auth-storage'
const mockReadAuth = jest.mocked(readPersistedAuth)
const mockWriteAuth = jest.mocked(writePersistedAuth)

const mockFetch = jest.fn()
;(globalThis as any).fetch = mockFetch

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (key: string) => {
        if (key === 'content-type') return 'application/json'
        if (key === 'content-length') return null
        return headers[key] ?? null
      }
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  }
}

function textResponse(text: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Error',
    headers: {
      get: (key: string) => {
        if (key === 'content-type') return 'text/plain'
        if (key === 'content-length') return null
        return null
      }
    },
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text)
  }
}

function emptyResponse(status = 204) {
  return {
    ok: true,
    status,
    statusText: 'No Content',
    headers: {
      get: (key: string) => {
        if (key === 'content-type') return null
        if (key === 'content-length') return '0'
        return null
      }
    },
    json: () => Promise.reject(new Error('no body')),
    text: () => Promise.resolve('')
  }
}

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    jest.clearAllMocks()
    client = new ApiClient()
    mockReadAuth.mockReturnValue({ accessToken: 'tok123', refreshToken: 'ref456' })
  })

  describe('request basics', () => {
    it('sends JSON GET request with auth header', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ data: 'ok' }))

      const result = await client.get('/api/test')

      expect(mockFetch).toHaveBeenCalledWith('/api/test', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok123' },
        body: undefined
      })
      expect(result).toEqual({ data: 'ok' })
    })

    it('sends POST request with body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }))

      await client.post('/api/items', { name: 'test' })

      expect(mockFetch).toHaveBeenCalledWith('/api/items', {
        method: 'POST',
        headers: expect.any(Object),
        body: '{"name":"test"}'
      })
    })

    it('returns undefined for 204 responses', async () => {
      mockFetch.mockResolvedValue(emptyResponse())

      const result = await client.delete('/api/items/1')

      expect(result).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('throws ApiError with JSON error body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404))

      await expect(client.get('/api/missing')).rejects.toThrow(ApiError)

      try {
        await client.get('/api/missing')
      } catch (err: any) {
        expect(err.message).toBe('Not found')
        expect(err.status).toBe(404)
      }
    })

    it('handles array message in error body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: ['field1 required', 'field2 invalid'] }, 400))

      try {
        await client.post('/api/items', {})
      } catch (err: any) {
        expect(err.message).toBe('field1 required, field2 invalid')
      }
    })

    it('falls back to text error body', async () => {
      mockFetch.mockResolvedValue(textResponse('Server Error', 500))

      try {
        await client.get('/api/broken')
      } catch (err: any) {
        expect(err.message).toBe('Server Error')
        expect(err.status).toBe(500)
      }
    })

    it('calls onApiError for non-401 errors', async () => {
      const onApiError = jest.fn()
      client.onApiError = onApiError
      mockFetch.mockResolvedValue(jsonResponse({ message: 'bad' }, 400))

      await expect(client.get('/api/bad')).rejects.toThrow()
      expect(onApiError).toHaveBeenCalledWith(expect.any(ApiError))
    })

    it('does not call onApiError for 401', async () => {
      const onApiError = jest.fn()
      client.onApiError = onApiError
      mockReadAuth.mockReturnValue({ accessToken: null, refreshToken: null })
      mockFetch.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401))

      await expect(client.get('/api/protected')).rejects.toThrow()
      expect(onApiError).not.toHaveBeenCalled()
    })
  })

  describe('401 retry with token refresh', () => {
    it('refreshes token and retries on 401', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-tok', refreshToken: 'new-ref' }))
        .mockResolvedValueOnce(jsonResponse({ data: 'success' }))

      const result = await client.get('/api/protected')

      expect(result).toEqual({ data: 'success' })
      expect(mockWriteAuth).toHaveBeenCalledWith('new-tok', 'new-ref')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('calls onAuthFailure when refresh returns null (no refresh token)', async () => {
      const onAuthFailure = jest.fn()
      client.onAuthFailure = onAuthFailure
      mockReadAuth.mockReturnValue({ accessToken: 'tok', refreshToken: null })
      mockFetch.mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, 401))

      await expect(client.get('/api/protected')).rejects.toThrow()
      expect(onAuthFailure).toHaveBeenCalled()
    })

    it('skips refresh for auth endpoints', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'bad creds' }, 401))

      await expect(client.login('a@b.com', 'wrong')).rejects.toThrow()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('tryRefreshToken deduplication', () => {
    it('deduplicates concurrent refresh calls', async () => {
      let fetchCount = 0
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url === 'string' && url.includes('/auth/refresh')) {
          fetchCount++
          return jsonResponse({ accessToken: 'new', refreshToken: 'new-ref' })
        }
        return jsonResponse({ message: 'Unauthorized' }, 401)
      })

      const p1 = client.get('/api/a')
      const p2 = client.get('/api/b')

      await Promise.allSettled([p1, p2])

      expect(fetchCount).toBeLessThanOrEqual(2)
    })
  })

  describe('getMaxUploadSizeMb', () => {
    it('caches the value after first fetch', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ maxSizeMb: 25 }))

      const first = await client.getMaxUploadSizeMb()
      const second = await client.getMaxUploadSizeMb()

      expect(first).toBe(25)
      expect(second).toBe(25)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('falls back to 50 on error', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'error' }, 500))

      const result = await client.getMaxUploadSizeMb()

      expect(result).toBe(50)
    })
  })
})
