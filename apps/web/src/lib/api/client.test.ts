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
        body: undefined,
        signal: expect.any(AbortSignal)
      })
      expect(result).toEqual({ data: 'ok' })
    })

    it('sends POST request with body', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ id: '1' }))

      await client.post('/api/items', { name: 'test' })

      expect(mockFetch).toHaveBeenCalledWith('/api/items', {
        method: 'POST',
        headers: expect.any(Object),
        body: '{"name":"test"}',
        signal: expect.any(AbortSignal)
      })
    })

    it('returns undefined for 204 responses', async () => {
      mockFetch.mockResolvedValue(emptyResponse())

      const result = await client.delete('/api/items/1')

      expect(result).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('forwards caller cancellation to the read transport', async () => {
      const controller = new AbortController()
      mockFetch.mockImplementationOnce((_url: string, { signal }: RequestInit) => new Promise((_resolve, reject) => {
        signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
      }))
      const result = expect(client.get('/api/read', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()
      await result
      expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(true)
    })
    it('aborts a stalled request and clears its deadline', async () => {
      jest.useFakeTimers()
      try {
        mockFetch.mockImplementationOnce(
          (_url: string, { signal }: RequestInit) =>
            new Promise((_resolve, reject) => {
              signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
            })
        )
        const result = expect(client.get('/api/stalled')).rejects.toMatchObject({ name: 'TimeoutError' })
        await jest.advanceTimersByTimeAsync(30_000)
        await result
        expect(jest.getTimerCount()).toBe(0)
      } finally {
        jest.useRealTimers()
      }
    })

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
    it('preserves caller cancellation through retry without cancelling a shared refresh', async () => {
      let finish!: (value: ReturnType<typeof jsonResponse>) => void
      mockFetch.mockImplementation((url: string) => url === '/api/auth/refresh'
        ? new Promise(resolve => { finish = resolve })
        : Promise.resolve(jsonResponse({ message: 'expired' }, 401)))
      const refresh = client.refreshToken('ref456')
      const controller = new AbortController()
      const read = expect(client.get('/api/protected', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
      await Promise.resolve()
      controller.abort()
      finish(jsonResponse({ accessToken: 'new', refreshToken: 'new-refresh' }))
      await refresh
      await read
      expect(mockFetch.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
      expect(mockFetch.mock.calls[0][1].signal.aborted).toBe(false)
      expect(mockFetch.mock.calls.filter(([url]) => url === '/api/protected')).toHaveLength(1)
    })

    it('preserves the session on a temporary refresh failure and can recover later', async () => {
      client.onAuthFailure = jest.fn()
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(jsonResponse({ message: 'Temporarily unavailable' }, 503))

      await expect(client.get('/api/protected')).rejects.toMatchObject({ status: 503 })
      expect(client.onAuthFailure).not.toHaveBeenCalled()
      expect(mockWriteAuth).not.toHaveBeenCalled()

      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-tok', refreshToken: 'new-ref' }))
        .mockResolvedValueOnce(jsonResponse({ data: 'recovered' }))

      await expect(client.get('/api/protected')).resolves.toEqual({ data: 'recovered' })
    })

    it('releases a stalled refresh so a later request can recover', async () => {
      jest.useFakeTimers()
      try {
        client.onAuthFailure = jest.fn()
        mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401)).mockImplementationOnce(
          (_url: string, { signal }: RequestInit) =>
            new Promise((_resolve, reject) => {
              signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
            })
        )
        const result = expect(client.get('/api/protected')).rejects.toMatchObject({ name: 'TimeoutError' })
        await jest.advanceTimersByTimeAsync(30_000)
        await result
        expect(client.onAuthFailure).not.toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)

        mockFetch
          .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
          .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-tok', refreshToken: 'new-ref' }))
          .mockResolvedValueOnce(jsonResponse({ data: 'recovered' }))
        await expect(client.get('/api/protected')).resolves.toEqual({ data: 'recovered' })
      } finally {
        jest.useRealTimers()
      }
    })

    it('reuses refreshed credentials when an older request returns a late 401', async () => {
      let resolveLateResponse!: (response: ReturnType<typeof jsonResponse>) => void
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLateResponse = resolve
          })
      )
      const lateRequest = client.get('/api/late')
      mockWriteAuth.mockImplementationOnce((accessToken, refreshToken) => {
        mockReadAuth.mockReturnValue({ accessToken, refreshToken })
      })
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-tok', refreshToken: 'new-ref' }))
        .mockResolvedValueOnce(jsonResponse({ data: 'first' }))
        .mockResolvedValueOnce(jsonResponse({ data: 'late' }))

      await expect(client.get('/api/first')).resolves.toEqual({ data: 'first' })
      resolveLateResponse(jsonResponse({ message: 'Unauthorized' }, 401))
      await expect(lateRequest).resolves.toEqual({ data: 'late' })

      expect(mockFetch.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/late',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer new-tok' })
        })
      )
    })

    it('shares a refresh between explicit session recovery and a protected request', async () => {
      const tokens = { accessToken: 'new-tok', refreshToken: 'new-ref' }
      let resolveRefresh!: (response: ReturnType<typeof jsonResponse>) => void
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve
          })
      )
      const sessionRefresh = client.refreshToken('ref456')
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
        .mockResolvedValue(jsonResponse({ data: 'success' }))
      const protectedRequest = client.get('/api/protected')
      await Promise.resolve()
      resolveRefresh(jsonResponse(tokens))

      await expect(sessionRefresh).resolves.toEqual(tokens)
      await expect(protectedRequest).resolves.toEqual({ data: 'success' })
      expect(mockFetch.mock.calls.filter(([url]) => url === '/api/auth/refresh')).toHaveLength(1)
      expect(mockWriteAuth).toHaveBeenCalledWith('new-tok', 'new-ref')
    })

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

    it('surfaces a failed limit check and does not cache an invented default', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ message: 'error' }, 500))
      await expect(client.getMaxUploadSizeMb()).rejects.toThrow('error')
      mockFetch.mockResolvedValue(jsonResponse({ maxSizeMb: 10 }))
      expect(await client.getMaxUploadSizeMb()).toBe(10)
    })

    it.each([0, -1, null, 'invalid', ''])('rejects an invalid server limit %p', async (maxSizeMb) => {
      mockFetch.mockResolvedValue(jsonResponse({ maxSizeMb }))
      await expect(client.getMaxUploadSizeMb()).rejects.toThrow('Invalid upload')
    })

    it('accepts the numeric string returned by deployments using environment configuration', async () => {
      mockFetch.mockResolvedValue(jsonResponse({ maxSizeMb: '50' }))
      expect(await client.getMaxUploadSizeMb()).toBe(50)
    })
  })

  describe('upload progress', () => {
    afterEach(() => jest.restoreAllMocks())
    it.each([false, true])('uploads a plain Blob with the original filename and bytes (progress: %s)', async (withProgress) => {
      const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'screenshot.png', {
        type: 'image/png'
      })
      // Observe the argument before FormData wraps the Blob in its own File.
      const append = jest.spyOn(FormData.prototype, 'append')
      const xhr = new XMLHttpRequest()
      const send = jest.spyOn(xhr, 'send').mockImplementation(() => {})
      jest.spyOn(xhr, 'open').mockImplementation(() => {})
      jest.spyOn(xhr, 'setRequestHeader').mockImplementation(() => {})
      jest.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(() => xhr)
      mockFetch.mockResolvedValue(jsonResponse({ id: 'image' }))

      const result = client.uploadAttachment(file, withProgress ? jest.fn() : undefined)
      const [field, blob, filename] = append.mock.calls[0]
      expect(field).toBe('file')
      expect(blob).toBeInstanceOf(Blob)
      expect(blob).not.toBeInstanceOf(File)
      expect(filename).toBe('screenshot.png')
      const body = (withProgress ? send.mock.calls[0][0] : mockFetch.mock.calls[0][1].body) as FormData
      const part = body.get('file') as File
      expect(part.name).toBe(file.name)
      expect(part.type).toBe(file.type)
      expect(part.size).toBe(file.size)
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(part)
      })
      expect(Array.from(new Uint8Array(bytes))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      if (withProgress) {
        Object.defineProperties(xhr, { status: { value: 201 }, response: { value: { id: 'image' } } })
        xhr.dispatchEvent(new Event('load'))
      } else {
        expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type')
      }
      expect(await result).toEqual({ id: 'image' })
    })

    it('reports actual file-byte progress and returns the server attachment', async () => {
      const xhr = new XMLHttpRequest()
      jest.spyOn(globalThis, 'XMLHttpRequest').mockImplementation(() => xhr)
      jest.spyOn(xhr, 'open').mockImplementation(() => {})
      jest.spyOn(xhr, 'setRequestHeader').mockImplementation(() => {})
      jest.spyOn(xhr, 'send').mockImplementation(() => {})
      const progress = jest.fn()
      const result = client.uploadAttachment(new File(['12345678'], 'test.txt'), progress)
      xhr.upload.dispatchEvent(new ProgressEvent('progress', { loaded: 50, total: 100, lengthComputable: true }))
      expect(progress).toHaveBeenCalledWith(4, 8)
      Object.defineProperties(xhr, { status: { value: 201 }, response: { value: { id: 'attachment' } } })
      xhr.dispatchEvent(new Event('load'))
      expect(await result).toEqual({ id: 'attachment' })
    })

    it('does not start an upload after cancellation', async () => {
      const signal = AbortSignal.abort()
      await expect(client.uploadAttachment(new File(['a'], 'a.txt'), jest.fn(), signal)).rejects.toMatchObject({
        name: 'AbortError'
      })
    })
  })
})
