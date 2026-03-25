import type { Channel } from '@chat/shared'
import { useMemo } from 'react'

export function useSortedChannels(channels: Channel[]) {
  const textChannels = useMemo(
    () => channels.filter((c) => c.type === 'text').sort((a, b) => a.position - b.position),
    [channels]
  )
  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === 'voice').sort((a, b) => a.position - b.position),
    [channels]
  )
  return { textChannels, voiceChannels }
}
