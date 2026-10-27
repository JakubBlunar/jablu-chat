import { useAppNavigate } from '@/hooks/useAppNavigate'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useForumStore } from '@/stores/forum.store'
import { useServerStore } from '@/stores/server.store'
import type { Channel, ForumLayout, ForumSortOrder, ForumTag } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelDraft } from './useChannelDraft'
type EditableForumTag = ForumTag & {
  saving?: boolean
  deleting?: boolean
}
export function useEditChannel({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const form = useChannelDraft(channel)
  const {
    description,
    categoryId,
    isArchived,
    setIsArchived,
    defaultSortOrder,
    defaultLayout,
    postGuidelines,
    requireTags,
    name
  } = form

  const { t: tChannels } = useTranslation('channels')
  const { t: tCommon } = useTranslation('common')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const { goToServer } = useAppNavigate()

  const [forumTags, setForumTags] = useState<EditableForumTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#7c3aed')
  const [newTagSaving, setNewTagSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const nameChanged = name !== channel.name
  const descriptionChanged = description.trim() !== (channel.description ?? '')
  const categoryChanged = categoryId !== (channel.categoryId ?? null)
  const archivedChanged = isArchived !== (channel.isArchived ?? false)
  const sortChanged = channel.type === 'forum' && defaultSortOrder !== (channel.defaultSortOrder ?? 'latest_activity')
  const layoutChanged = channel.type === 'forum' && defaultLayout !== (channel.defaultLayout ?? 'list')
  const guidelinesChanged = channel.type === 'forum' && postGuidelines !== (channel.postGuidelines ?? '')
  const requireTagsChanged = channel.type === 'forum' && requireTags !== (channel.requireTags ?? false)
  const hasChanges =
    nameChanged ||
    descriptionChanged ||
    categoryChanged ||
    archivedChanged ||
    sortChanged ||
    layoutChanged ||
    guidelinesChanged ||
    requireTagsChanged

  useEffect(() => {
    if (channel.type !== 'forum') return
    let cancelled = false
    setTagsLoading(true)
    api
      .getForumTags(channel.id)
      .then((tags) => {
        if (cancelled) return
        setForumTags(tags)
        setTagsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setTagsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channel.id, channel.type])

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim()
    if (!name) return
    setNewTagSaving(true)
    setError(null)
    try {
      const created = await api.createForumTag(channel.id, { name, color: newTagColor || undefined })
      setForumTags((prev) => [...prev, created])
      void useForumStore.getState().fetchTags(channel.id)
      setNewTagName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.createTagFailed'))
    } finally {
      setNewTagSaving(false)
    }
  }, [channel.id, newTagName, newTagColor, tChannels])

  const handleUpdateTag = useCallback(
    async (tagId: string, name: string, color: string | null) => {
      setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, saving: true } : t)))
      setError(null)
      try {
        const updated = await api.updateForumTag(channel.id, tagId, { name: name.trim(), color })
        setForumTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)))
        void useForumStore.getState().fetchTags(channel.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : tChannels('errors.updateTagFailed'))
        setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, saving: false } : t)))
      }
    },
    [channel.id, tChannels]
  )

  const handleDeleteTag = useCallback(
    async (tagId: string) => {
      setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, deleting: true } : t)))
      setError(null)
      try {
        await api.deleteForumTag(channel.id, tagId)
        setForumTags((prev) => prev.filter((t) => t.id !== tagId))
        void useForumStore.getState().fetchTags(channel.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : tChannels('errors.deleteTagFailed'))
        setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, deleting: false } : t)))
      }
    },
    [channel.id, tChannels]
  )

  const handleSave = useCallback(async () => {
    if (!currentServerId || !name) return
    if (!hasChanges) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const patch: {
        name?: string
        description?: string | null
        categoryId?: string | null
        isArchived?: boolean
        defaultSortOrder?: ForumSortOrder
        defaultLayout?: ForumLayout
        postGuidelines?: string | null
        requireTags?: boolean
      } = {}
      if (nameChanged) patch.name = name
      if (descriptionChanged) patch.description = description.trim() || null
      if (categoryChanged) patch.categoryId = categoryId
      if (archivedChanged) patch.isArchived = isArchived
      if (sortChanged) patch.defaultSortOrder = defaultSortOrder
      if (layoutChanged) patch.defaultLayout = defaultLayout
      if (guidelinesChanged) patch.postGuidelines = postGuidelines.trim() || null
      if (requireTagsChanged) patch.requireTags = requireTags
      await api.updateChannel(currentServerId, channel.id, patch)
      await fetchChannels(currentServerId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.updateChannelFailed'))
    } finally {
      setSaving(false)
    }
  }, [
    currentServerId,
    channel,
    name,
    description,
    categoryId,
    isArchived,
    defaultSortOrder,
    defaultLayout,
    postGuidelines,
    requireTags,
    nameChanged,
    descriptionChanged,
    categoryChanged,
    archivedChanged,
    sortChanged,
    layoutChanged,
    guidelinesChanged,
    requireTagsChanged,
    hasChanges,
    fetchChannels,
    onClose,
    tChannels
  ])

  const handleDelete = useCallback(async () => {
    if (!currentServerId) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteChannel(currentServerId, channel.id)
      await fetchChannels(currentServerId)
      if (currentChannelId === channel.id) {
        goToServer(currentServerId)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.deleteChannelFailed'))
      setDeleting(false)
    }
  }, [currentServerId, channel.id, currentChannelId, goToServer, fetchChannels, onClose, tChannels])

  return {
    form,
    isArchived,
    setIsArchived,
    name,
    tChannels,
    tCommon,
    categories,
    forumTags,
    setForumTags,
    tagsLoading,
    newTagName,
    setNewTagName,
    newTagColor,
    setNewTagColor,
    newTagSaving,
    saving,
    error,
    confirmDelete,
    setConfirmDelete,
    deleting,
    hasChanges,
    handleCreateTag,
    handleUpdateTag,
    handleDeleteTag,
    handleSave,
    handleDelete
  }
}
