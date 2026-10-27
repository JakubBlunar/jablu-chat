import { renderHook } from '@testing-library/react'
import { Permission } from '@chat/shared'
import { makeChannel } from '@/test/factories'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useVisibleChannelGroups } from './useVisibleChannelGroups'

it('applies the same channel visibility rule before grouping on either surface', () => {
  useChannelPermissionsStore.setState({
    permissionsMap: {
      hidden: 0n,
      visible: Permission.VIEW_CHANNEL
    }
  })
  const channels = [makeChannel('hidden', 'server'), makeChannel('visible', 'server'), makeChannel('pending', 'server')]
  const { result } = renderHook(() => useVisibleChannelGroups(channels, []))
  expect(result.current.uncategorizedText.map((channel) => channel.id)).toEqual(['visible', 'pending'])
})
