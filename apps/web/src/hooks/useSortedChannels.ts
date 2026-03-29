import type { Channel, ChannelCategory } from '@chat/shared'
import { useMemo } from 'react'

export type CategoryGroup = {
  category: ChannelCategory
  textChannels: Channel[]
  voiceChannels: Channel[]
}

export function useSortedChannels(channels: Channel[], categories: ChannelCategory[] = []) {
  const sorted = useMemo(() => {
    const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position

    const uncatText = channels
      .filter((c) => c.type === 'text' && !c.categoryId)
      .sort(byPos)
    const uncatVoice = channels
      .filter((c) => c.type === 'voice' && !c.categoryId)
      .sort(byPos)

    const groups: CategoryGroup[] = [...categories].sort(byPos).map((cat) => ({
      category: cat,
      textChannels: channels
        .filter((c) => c.categoryId === cat.id && c.type === 'text')
        .sort(byPos),
      voiceChannels: channels
        .filter((c) => c.categoryId === cat.id && c.type === 'voice')
        .sort(byPos)
    }))

    const allText = channels.filter((c) => c.type === 'text').sort(byPos)
    const allVoice = channels.filter((c) => c.type === 'voice').sort(byPos)

    return {
      textChannels: allText,
      voiceChannels: allVoice,
      uncategorizedText: uncatText,
      uncategorizedVoice: uncatVoice,
      categoryGroups: groups
    }
  }, [channels, categories])

  return sorted
}
