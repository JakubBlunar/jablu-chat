import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { AttachmentBrowser } from '@/components/media/AttachmentBrowser'

export function ChannelMediaGrid({ serverId, channelId }: { serverId: string; channelId: string }) {
  const { t } = useTranslation('common')
  const loadPage = useCallback((page: number, limit: number) =>
    api.getChannelAttachments(serverId, channelId, 'media', page, limit), [serverId, channelId])
  return <AttachmentBrowser key={`${serverId}:${channelId}`} kind="media" loadPage={loadPage} emptyLabel={t('channelMediaEmpty')} />
}
