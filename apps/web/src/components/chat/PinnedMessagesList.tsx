import type { Message } from '@chat/shared'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard } from '@/components/LinkPreviewCard'
import { MessageMediaProvider } from '@/components/media/MessageMediaGallery'
import { MarkdownContent } from '@/components/MarkdownContent'
import { UserAvatar } from '@/components/UserAvatar'
import { formatSmartTimestamp } from '@/lib/format-time'
import { setMessagePinned } from '@/lib/messagePins'
import { IconButton, Spinner } from '@/components/ui'
import { serverDisplayName } from '@/lib/serverProfile'
import { useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'

export function PinnedMessagesList({
  messages,
  loading,
  canUnpin,
  channelId,
  conversationId,
  onJump,
  emptyLabel,
  jumpLabel,
  className = ''
}: {
  messages: Message[]
  loading: boolean
  canUnpin: boolean
  channelId?: string
  conversationId?: string
  onJump: (messageId: string) => void
  emptyLabel: string
  jumpLabel: string
  className?: string
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const members = useMemberStore((s) => s.members)
  const serverId = useServerStore((s) => s.currentServerId)
  const [pending, setPending] = useState<string[]>([])
  const [failedId, setFailedId] = useState<string | null>(null)
  const handleUnpin = useCallback(
    async (messageId: string) => {
      const contextId = conversationId ?? channelId
      if (!contextId) return
      setPending((ids) => [...ids, messageId])
      setFailedId(null)
      try {
        await setMessagePinned(conversationId ? 'dm' : 'channel', contextId, messageId, false)
      } catch (error) {
        console.error('Failed to unpin message', error)
        setFailedId(messageId)
      } finally {
        setPending((ids) => ids.filter((id) => id !== messageId))
      }
    },
    [channelId, conversationId]
  )

  if (loading && messages.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 py-8 ${className}`}>
        <Spinner size="lg" />
        <p className="text-center text-sm text-gray-400">{tCommon('loading')}</p>
      </div>
    )
  }

  if (messages.length === 0) {
    return <p className={`px-3 py-6 text-center text-sm text-gray-400 ${className}`}>{emptyLabel}</p>
  }

  return (
    <div className={`divide-y divide-white/5 ${className}`}>
      {loading && (
        <p role="status" className="px-3 py-2 text-sm text-gray-400">
          {tCommon('loading')}
        </p>
      )}
      {failedId && (
        <div role="alert" className="px-3 py-2 text-sm text-red-300">
          <p>{t('pinActionFailed')}</p>
          <button type="button" className="min-h-11 text-primary" onClick={() => void handleUnpin(failedId)}>
            {tCommon('retry')}
          </button>
        </div>
      )}
      {messages.map((m) => {
        const name = serverDisplayName(m.author, conversationId ? null : serverId, members) ?? t('deletedUser')
        const attachments = m.attachments ?? []
        const linkPreviews = m.linkPreviews ?? []
        return (
          <div key={m.id} className="group/pin px-3 py-3">
            <div className="flex items-start gap-2.5">
              <UserAvatar username={name} avatarUrl={m.author?.avatarUrl ?? null} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-white">{name}</span>
                  <time className="text-[11px] text-gray-500">{formatSmartTimestamp(m.createdAt)}</time>
                </div>

                {m.content && (
                  <div className="mt-0.5 text-sm [&_p]:text-sm [&_p]:leading-relaxed [&_pre]:max-h-32 [&_pre]:overflow-auto">
                    <MarkdownContent content={m.content} />
                  </div>
                )}

                <MessageMediaProvider attachments={attachments} linkPreviews={linkPreviews}>
                  {attachments.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1 [&_img]:max-h-40 [&_video]:max-h-40">
                      {attachments.map((att) => (
                        <AttachmentPreview key={att.id} attachment={att} />
                      ))}
                    </div>
                  )}

                  {linkPreviews.length > 0 && (
                    <div className="mt-1 flex flex-col gap-1">
                      {linkPreviews.map((lp) => (
                        <LinkPreviewCard key={lp.id} lp={lp} />
                      ))}
                    </div>
                  )}
                </MessageMediaProvider>

                {!m.content && attachments.length === 0 && (
                  <p className="mt-0.5 text-sm italic text-gray-500">{t('emptyMessage')}</p>
                )}
              </div>
              {canUnpin && (
                <IconButton
                  label={t('actionUnpin')}
                  disabled={pending.includes(m.id)}
                  variant="danger"
                  size="sm"
                  className="shrink-0 opacity-60 hover:opacity-100"
                  onClick={() => void handleUnpin(m.id)}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              )}
            </div>
            <button
              type="button"
              onClick={() => onJump(m.id)}
              className="mt-1.5 text-[11px] font-medium text-primary/70 transition hover:text-primary"
            >
              {jumpLabel}
            </button>
          </div>
        )
      })}
    </div>
  )
}
