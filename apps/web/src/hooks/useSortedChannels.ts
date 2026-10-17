import type { Channel, ChannelCategory } from '@chat/shared'
import { useMemo } from 'react'

export type CategoryGroup = {
  category: ChannelCategory
  textChannels: Channel[]
  voiceChannels: Channel[]
  forumChannels: Channel[]
}

const EMPTY_CATEGORIES: ChannelCategory[] = []

export function useSortedChannels(channels: Channel[], categories: ChannelCategory[] = EMPTY_CATEGORIES) {
  const sorted = useMemo(() => {
    const byPos = (a: { position: number }, b: { position: number }) => a.position - b.position

    const groups: CategoryGroup[] = [...categories].sort(byPos).map((category) => ({
      category,
      textChannels: [],
      voiceChannels: [],
      forumChannels: []
    }))
    const byCategory = new Map(groups.map((group) => [group.category.id, group]))
    const uncategorized: Omit<CategoryGroup, 'category'> = { textChannels: [], voiceChannels: [], forumChannels: [] }
    const allText: Channel[] = []
    const allVoice: Channel[] = []
    const allForum: Channel[] = []
    const archived: Channel[] = []

    for (const channel of [...channels].sort(byPos)) {
      if (channel.isArchived) {
        archived.push(channel)
        continue
      }
      const group = channel.categoryId ? byCategory.get(channel.categoryId) : uncategorized
      switch (channel.type) {
        case 'text':
          allText.push(channel)
          group?.textChannels.push(channel)
          break
        case 'voice':
          allVoice.push(channel)
          group?.voiceChannels.push(channel)
          break
        case 'forum':
          allForum.push(channel)
          group?.forumChannels.push(channel)
          break
      }
    }

    return {
      textChannels: allText,
      voiceChannels: allVoice,
      forumChannels: allForum,
      uncategorizedText: uncategorized.textChannels,
      uncategorizedVoice: uncategorized.voiceChannels,
      uncategorizedForum: uncategorized.forumChannels,
      categoryGroups: groups,
      archivedChannels: archived
    }
  }, [channels, categories])

  return sorted
}
