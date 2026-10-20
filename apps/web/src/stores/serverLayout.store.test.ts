import type { ServerLayoutEntry } from '@chat/shared'
import { api } from '@/lib/api'
import { serverLayoutOwner, useServerLayoutStore } from './serverLayout.store'

jest.mock('@/lib/api', () => ({ api: { baseUrl: '', get: jest.fn(), put: jest.fn() } }))
jest.mock('./toast.store', () => ({ showToast: jest.fn() }))

const serverId = '00000000-0000-4000-8000-000000000001'
const entries: ServerLayoutEntry[] = [{ type: 'server', serverId }]
const folder: ServerLayoutEntry = {
  type: 'folder',
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Games',
  collapsed: true,
  serverIds: [serverId]
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  useServerLayoutStore.getState().reset()
  localStorage.clear()
  jest.clearAllMocks()
  api.baseUrl = ''
})
afterEach(() => jest.restoreAllMocks())

it('loads the account layout once for multiple rails', async () => {
  jest.mocked(api.get).mockResolvedValue(entries)
  await Promise.all([useServerLayoutStore.getState().load('me'), useServerLayoutStore.getState().load('me')])
  expect(api.get).toHaveBeenCalledTimes(1)
  expect(useServerLayoutStore.getState()).toMatchObject({ entries, status: 'ready', ownerKey: ':me' })
})

it('hydrates cached folders before the network request finishes and then refreshes them', async () => {
  localStorage.setItem(
    'jablu-server-layout',
    JSON.stringify({ state: { ownerKey: ':me', entries: [folder] }, version: 0 })
  )
  await useServerLayoutStore.persist.rehydrate()
  const response = deferred<ServerLayoutEntry[]>()
  jest.mocked(api.get).mockReturnValue(response.promise)
  const load = useServerLayoutStore.getState().load('me')
  expect(useServerLayoutStore.getState().entries).toEqual([folder])
  expect(useServerLayoutStore.getState().status).toBe('loading')
  response.resolve(entries)
  await load
  expect(useServerLayoutStore.getState().entries).toEqual(entries)
})

it('optimistically saves, persists locally and rejects overlapping writes', async () => {
  jest.mocked(api.get).mockResolvedValue(entries)
  await useServerLayoutStore.getState().load('me')
  const response = deferred<ServerLayoutEntry[]>()
  jest.mocked(api.put).mockReturnValue(response.promise)
  const save = useServerLayoutStore.getState().save([folder])
  expect(useServerLayoutStore.getState()).toMatchObject({ entries: [folder], isSaving: true })
  expect(JSON.parse(localStorage.getItem('jablu-server-layout')!).state.entries).toEqual([folder])
  await expect(useServerLayoutStore.getState().save(entries)).rejects.toThrow()
  response.resolve([folder])
  await save
  expect(api.put).toHaveBeenCalledWith('/api/users/@me/server-layout', { entries: [folder] })
  expect(useServerLayoutStore.getState().isSaving).toBe(false)
})

it('rolls back failed writes in memory and on disk', async () => {
  jest.mocked(api.get).mockResolvedValue(entries)
  await useServerLayoutStore.getState().load('me')
  jest.mocked(api.put).mockRejectedValue(new Error('offline'))
  await expect(useServerLayoutStore.getState().save([folder])).rejects.toThrow('offline')
  expect(useServerLayoutStore.getState()).toMatchObject({ entries, isSaving: false })
  expect(JSON.parse(localStorage.getItem('jablu-server-layout')!).state.entries).toEqual(entries)
})

it('keeps cached data on load errors, blocks editing, and permits retry', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  useServerLayoutStore.setState({ entries, ownerKey: ':me' })
  jest.mocked(api.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([folder])
  await useServerLayoutStore.getState().load('me')
  expect(useServerLayoutStore.getState()).toMatchObject({ entries, status: 'error' })
  await expect(useServerLayoutStore.getState().save([folder])).rejects.toThrow()
  await useServerLayoutStore.getState().load('me')
  expect(useServerLayoutStore.getState()).toMatchObject({ entries: [folder], status: 'ready' })
})

it('never applies a late response from a previous account or session', async () => {
  const old = deferred<ServerLayoutEntry[]>()
  jest.mocked(api.get).mockReturnValueOnce(old.promise).mockResolvedValueOnce([])
  const oldLoad = useServerLayoutStore.getState().load('old')
  await useServerLayoutStore.getState().load('new')
  old.resolve(entries)
  await oldLoad
  expect(useServerLayoutStore.getState()).toMatchObject({ entries: [], ownerKey: ':new' })
  useServerLayoutStore.getState().reset()
  expect(useServerLayoutStore.getState()).toMatchObject({ entries: [], ownerKey: null })
})

it('scopes caches to the configured server instance as well as the account', async () => {
  useServerLayoutStore.setState({ entries, ownerKey: ':me' })
  api.baseUrl = 'https://another.example'
  const response = deferred<ServerLayoutEntry[]>()
  jest.mocked(api.get).mockReturnValue(response.promise)
  const load = useServerLayoutStore.getState().load('me')
  expect(serverLayoutOwner('me')).toBe('https://another.example:me')
  expect(useServerLayoutStore.getState().entries).toEqual([])
  response.resolve([])
  await load
})
