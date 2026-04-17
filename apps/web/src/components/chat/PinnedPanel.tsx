import type { Message } from '@chat/shared'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { PinnedMessagesList } from '@/components/chat/PinnedMessagesList'
import { IconButton } from '@/components/ui'

export function PinnedPanel({
  messages,
  loading,
  onClose,
  canUnpin,
  channelId,
  conversationId,
  onJump
}: {
  messages: Message[]
  loading: boolean
  onClose: () => void
  canUnpin: boolean
  channelId?: string
  conversationId?: string
  onJump: (messageId: string) => void
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const emptyLabel = conversationId ? t('pinnedEmptyDm') : t('pinnedEmptyChannel')

  return (
    <div className="absolute right-2 top-14 z-30 flex max-h-[28rem] w-96 max-w-[calc(100vw-1rem)] flex-col rounded-lg bg-surface-dark shadow-2xl ring-1 ring-white/10 sm:right-4">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{t('pinnedMessagesTitle')}</h3>
        <IconButton label={tCommon('close')} variant="ghost" onClick={onClose}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18 18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>
      <SimpleBar className="flex-1">
        <PinnedMessagesList
          messages={messages}
          loading={loading}
          canUnpin={canUnpin}
          channelId={channelId}
          conversationId={conversationId}
          onJump={onJump}
          emptyLabel={emptyLabel}
          jumpLabel={t('jumpToMessage')}
        />
      </SimpleBar>
    </div>
  )
}
