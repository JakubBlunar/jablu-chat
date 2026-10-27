import { useEffect, useRef, useState } from 'react'
import type { Channel, ForumLayout, ForumSortOrder } from '@chat/shared'

export function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function useChannelDraft(channel?: Channel, defaultCategoryId?: string | null) {
  const [rawName, setRawName] = useState(channel?.name ?? '')
  const [description, setDescription] = useState(channel?.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(channel?.categoryId ?? defaultCategoryId ?? null)
  const [defaultLayout, setDefaultLayout] = useState<ForumLayout>(channel?.defaultLayout ?? 'list')
  const [defaultSortOrder, setDefaultSortOrder] = useState<ForumSortOrder>(
    channel?.defaultSortOrder ?? 'latest_activity'
  )
  const [postGuidelines, setPostGuidelines] = useState(channel?.postGuidelines ?? '')
  const [requireTags, setRequireTags] = useState(channel?.requireTags ?? false)
  const [isArchived, setIsArchived] = useState(channel?.isArchived ?? false)
  const identity = channel?.id ?? 'create:' + (defaultCategoryId ?? '')
  const previousIdentity = useRef(identity)

  useEffect(() => {
    if (previousIdentity.current === identity) return
    previousIdentity.current = identity
    setRawName(channel?.name ?? '')
    setDescription(channel?.description ?? '')
    setCategoryId(channel?.categoryId ?? defaultCategoryId ?? null)
    setDefaultLayout(channel?.defaultLayout ?? 'list')
    setDefaultSortOrder(channel?.defaultSortOrder ?? 'latest_activity')
    setPostGuidelines(channel?.postGuidelines ?? '')
    setRequireTags(channel?.requireTags ?? false)
    setIsArchived(channel?.isArchived ?? false)
  }, [identity, channel, defaultCategoryId])

  return {
    rawName,
    setRawName,
    name: normalizeChannelName(rawName),
    description,
    setDescription,
    categoryId,
    setCategoryId,
    defaultLayout,
    setDefaultLayout,
    defaultSortOrder,
    setDefaultSortOrder,
    postGuidelines,
    setPostGuidelines,
    requireTags,
    setRequireTags,
    isArchived,
    setIsArchived
  }
}

export type ChannelDraft = ReturnType<typeof useChannelDraft>
