import type { Channel, ChannelCategory } from '@chat/shared'
import { hasPermission, Permission } from '@chat/shared'
import { useMemo } from 'react'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useSortedChannels } from './useSortedChannels'

export function useVisibleChannelGroups(channels: Channel[], categories: ChannelCategory[]) {
  const permissions = useChannelPermissionsStore((state) => state.permissionsMap)
  const visible = useMemo(
    () =>
      channels.filter((channel) => {
        const granted = permissions[channel.id]
        return granted === undefined || hasPermission(granted, Permission.VIEW_CHANNEL)
      }),
    [channels, permissions]
  )
  return useSortedChannels(visible, categories)
}
