import { useAppNavigate } from '@/hooks/useAppNavigate'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import type { ChannelType } from '@chat/shared'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChannelDraft } from './useChannelDraft'
export type CreateChannelModalProps = {
  open: boolean
  onClose: () => void
  defaultCategoryId?: string | null
}
type DraftForumTag = {
  name: string
  color: string
}
export function useCreateChannel({ onClose, defaultCategoryId }: CreateChannelModalProps) {
  const form = useChannelDraft(undefined, defaultCategoryId)
  const {
    setRawName,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    defaultLayout,
    setDefaultLayout,
    postGuidelines,
    setPostGuidelines,
    requireTags,
    setRequireTags,
    name
  } = form

  const { t: tChannels } = useTranslation('channels')
  const { t: tCommon } = useTranslation('common')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const { goToChannel } = useAppNavigate()

  const [type, setType] = useState<ChannelType>('text')

  const [draftTags, setDraftTags] = useState<DraftForumTag[]>([])
  const [draftTagName, setDraftTagName] = useState('')
  const [draftTagColor, setDraftTagColor] = useState('#7c3aed')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    setRawName('')
    setDescription('')
    setType('text')
    setCategoryId(null)
    setDefaultLayout('list')
    setPostGuidelines('')
    setRequireTags(false)
    setDraftTags([])
    setDraftTagName('')
    setDraftTagColor('#7c3aed')
    onClose()
    setError(null)
  }

  async function handleCreate() {
    if (!currentServerId) {
      setError(tChannels('errors.noServerSelected'))
      return
    }
    if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      setError(tChannels('errors.invalidChannelName', { example: 'my-channel' }))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { name, type, categoryId: categoryId || undefined }
      if (type === 'text' && description.trim()) body.description = description.trim()
      if (type === 'forum') {
        body.defaultLayout = defaultLayout
        if (postGuidelines.trim()) body.postGuidelines = postGuidelines.trim()
        body.requireTags = requireTags
      }
      const created = await api.post<{
        id: string
        serverId: string
        name: string
        type: ChannelType
        position: number
        createdAt: string
      }>(`/api/servers/${currentServerId}/channels`, body)
      if (type === 'forum' && draftTags.length > 0) {
        for (const tag of draftTags) {
          await api.createForumTag(created.id, { name: tag.name, color: tag.color })
        }
      }
      await fetchChannels(currentServerId)
      if ((type === 'text' || type === 'forum') && currentServerId) {
        goToChannel(currentServerId, created.id)
      }
      handleCancel()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.createChannelFailed'))
    } finally {
      setBusy(false)
    }
  }

  return {
    form,
    tChannels,
    tCommon,
    categories,
    type,
    setType,
    draftTags,
    setDraftTags,
    draftTagName,
    setDraftTagName,
    draftTagColor,
    setDraftTagColor,
    busy,
    error,
    handleCancel,
    handleCreate
  }
}
