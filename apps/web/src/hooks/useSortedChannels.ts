import type { Channel, ChannelCategory } from '@chat/shared'
import { useMemo } from 'react'

export type CategoryGroup = {
  category: ChannelCategory
  textChannels: Channel[]
  voiceChannels: Channel[]
  forumChannels: Channel[]
}

export function useSortedChannels(channels: Channel[], categories: ChannelCategory[] = []) {
  const sorted = useMemo(() => {
    const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position

    const active = channels.filter((c) => !c.isArchived)
    const archived = channels.filter((c) => c.isArchived).sort(byPos)

    const uncatText = active
      .filter((c) => c.type === 'text' && !c.categoryId)
      .sort(byPos)
    const uncatVoice = active
      .filter((c) => c.type === 'voice' && !c.categoryId)
      .sort(byPos)
    const uncatForum = active
      .filter((c) => c.type === 'forum' && !c.categoryId)
      .sort(byPos)

    const groups: CategoryGroup[] = [...categories].sort(byPos).map((cat) => ({
      category: cat,
      textChannels: active
        .filter((c) => c.categoryId === cat.id && c.type === 'text')
        .sort(byPos),
      voiceChannels: active
        .filter((c) => c.categoryId === cat.id && c.type === 'voice')
        .sort(byPos),
      forumChannels: active
        .filter((c) => c.categoryId === cat.id && c.type === 'forum')
        .sort(byPos)
    }))

    const allText = active.filter((c) => c.type === 'text').sort(byPos)
    const allVoice = active.filter((c) => c.type === 'voice').sort(byPos)
    const allForum = active.filter((c) => c.type === 'forum').sort(byPos)

    return {
      textChannels: allText,
      voiceChannels: allVoice,
      forumChannels: allForum,
      uncategorizedText: uncatText,
      uncategorizedVoice: uncatVoice,
      uncategorizedForum: uncatForum,
      categoryGroups: groups,
      archivedChannels: archived
    }
  }, [channels, categories])

  return sorted
}
