import { act, renderHook, waitFor } from '@testing-library/react'
import { useServerResources } from './useServerResources'
import { useNavigationStore } from '@/test/conversationRouter'
import { useServerStore } from '@/stores/server.store'
import { useChannelStore } from '@/stores/channel.store'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { clearStructureCache } from '@/lib/cache/structureCache'
import { api } from '@/lib/api'

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/lib/api', () => ({ api: { get: jest.fn(), getAllChannelPermissions: jest.fn(), getServerEmojis: jest.fn().mockResolvedValue([]) } }))

it('issues one channel/category/permission refresh per cold or warm navigation generation', async () => {
  clearStructureCache()
  useChannelStore.getState().clear()
  useChannelPermissionsStore.getState().clear()
  useMemberStore.getState().clear()
  useServerStore.setState({ currentServerId: null, viewMode: 'server' })
  useNavigationStore.setState({ navigatingToServerId: null, isNavigating: false })
  jest.mocked(api.get).mockImplementation(async path => {
    const serverId = path.split('/')[3]
    if (path.endsWith('/channels')) return [{ id: `${serverId}-channel`, serverId, name: 'general', type: 'text', position: 0 }] as never
    if (path.endsWith('/roster')) return { members: [], roles: [], nextCursor: null } as never
    return [] as never
  })
  jest.mocked(api.getAllChannelPermissions).mockImplementation(async id => ({ [`${id}-channel`]: '4096' }))
  const history = jest.spyOn(useMessageStore.getState(), 'fetchMessages').mockResolvedValue()
  const { unmount } = renderHook(() => useServerResources())
  try {
    for (const serverId of ['a', 'b', 'a']) {
      await act(async () => { await useNavigationStore.getState().navigateToChannel({ serverId, channelId: `${serverId}-channel` }) })
      await waitFor(() => expect(useChannelStore.getState().isLoading).toBe(false))
      expect(useServerStore.getState().currentServerId).toBe(serverId)
    }
    const paths = jest.mocked(api.get).mock.calls.map(([path]) => path)
    expect(paths.filter(path => path === '/api/servers/a/channels')).toHaveLength(2)
    expect(paths.filter(path => path === '/api/servers/b/channels')).toHaveLength(1)
    expect(paths.filter(path => path.endsWith('/categories'))).toHaveLength(3)
    expect(api.getAllChannelPermissions).toHaveBeenCalledTimes(3)
  } finally { unmount(); history.mockRestore() }
})
