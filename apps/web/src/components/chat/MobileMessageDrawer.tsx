import type { Attachment } from '@chat/shared'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDownload } from '@/hooks/useMediaDownload'
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal'
import { TranslateModal } from '@/components/chat/TranslateModal'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import { useMessageDeletion } from '@/components/chat/hooks/useMessageDeletion'
import {
  useMessageActionController,
  type MessageActionOptions
} from '@/components/chat/hooks/useMessageActionController'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import {
  BookmarkIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ForwardIcon,
  GlobeIcon,
  LinkIcon,
  MessagePinIcon,
  ReplyIcon,
  ShareIcon,
  SmileIcon,
  ThreadIcon,
  TrashIcon
} from '@/components/chat/chatIcons'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '🎉']

const URL_RE = /https?:\/\/[^\s<>)"']+/gi

function extractLinks(content: string | null): string[] {
  if (!content) return []
  const matches = content.match(URL_RE)
  return matches ? [...new Set(matches)] : []
}

interface MobileMessageDrawerProps extends MessageActionOptions {
  onClose: () => void
  onEdit?: () => void
  onReply: () => void
  onOpenEmojiPicker?: () => void
}

export function MobileMessageDrawer({
  message,
  contextId,
  mode,
  hidePinAction,
  hideBookmarkAction,
  onClose,
  onEdit,
  onReply,
  onOpenEmojiPicker
}: MobileMessageDrawerProps) {
  const { t } = useTranslation('chat')
  const isDm = mode === 'dm'
  const actions = useMessageActionController({
    message,
    mode,
    contextId,
    onEdit,
    onReply,
    hidePinAction,
    hideBookmarkAction,
    onComplete: onClose
  })
  const deletion = useMessageDeletion(mode, contextId, message, onClose)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const links = useMemo(() => {
    const contentLinks = extractLinks(message.content)
    const previewLinks = (message.linkPreviews ?? []).map((lp) => lp.url)
    return [...new Set([...contentLinks, ...previewLinks])]
  }, [message.content, message.linkPreviews])

  const attachments = message.attachments ?? []

  const close = onClose

  if (confirmDelete) {
    return (
      <ConfirmDialog
        title={t('actionDelete')}
        description={t('deleteMessageWarning')}
        confirmLabel={t(deletion.pending ? 'messageActionPending' : 'actionDelete')}
        cancelLabel={t('editCancel')}
        busy={deletion.pending}
        error={deletion.error}
        onConfirm={() => void deletion.confirm()}
        onCancel={() => setConfirmDelete(false)}
      />
    )
  }

  if (forwardOpen && !isDm) {
    return (
      <ForwardMessageModal
        message={message}
        sourceChannelId={contextId}
        onClose={() => setForwardOpen(false)}
        onForwarded={close}
      />
    )
  }

  if (translateOpen) {
    return (
      <TranslateModal
        messageId={message.id}
        sourceVersion={messageTranslationVersion(message)}
        onClose={() => setTranslateOpen(false)}
      />
    )
  }

  return (
    <BottomSheet open onClose={close}>
      {/* Quick emoji row */}
      <div className="flex items-center gap-1 overflow-x-auto px-3 pb-3 scrollbar-none">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={actions.reactionPending}
            aria-label={`${t('actionAddReaction')} ${emoji}`}
            onClick={() => void actions.react(emoji)}
            className="shrink-0 rounded-full p-2 text-2xl active:scale-110 active:bg-white/10"
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onClose()
            onOpenEmojiPicker?.()
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-light text-gray-400 active:bg-white/10"
          aria-label={t('moreEmojis')}
        >
          <SmileIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="border-t border-white/5" />

      <div className="flex flex-col gap-1.5 px-3 pt-3">
        <SheetBtn icon={<ReplyIcon className="h-5 w-5" />} label={t('actionReply')} onClick={actions.reply} />
        {actions.canThread && (
          <SheetBtn
            icon={<ThreadIcon className="h-5 w-5" />}
            label={t((message.threadCount ?? 0) > 0 ? 'actionViewThread' : 'actionCreateThread')}
            onClick={actions.thread}
          />
        )}
        {actions.canForward && (
          <SheetBtn
            icon={<ForwardIcon className="h-5 w-5" />}
            label={t('actionForward')}
            onClick={() => setForwardOpen(true)}
          />
        )}
        {actions.shareableUrl && (
          <SheetBtn icon={<LinkIcon />} label={t('actionCopyMessageLink')} onClick={() => void actions.copyLink()} />
        )}
        {actions.shareableUrl && (
          <SheetBtn
            icon={<ShareIcon className="h-5 w-5" />}
            label={t('actionShareMessage')}
            onClick={() => void actions.share()}
          />
        )}
        {message.content && (
          <SheetBtn icon={<CopyIcon />} label={t('actionCopyText')} onClick={() => void actions.copyText()} />
        )}
        {actions.canTranslate && (
          <SheetBtn
            icon={<GlobeIcon className="h-5 w-5" />}
            label={t('actionTranslate')}
            onClick={() => actions.translate(() => setTranslateOpen(true))}
          />
        )}
        {actions.translationSetupError && (
          <SheetBtn icon={<GlobeIcon />} label={t('translationSetupRetry')} onClick={actions.retryTranslation} />
        )}
        {links.map((url) => (
          <SheetBtn
            key={url}
            icon={<LinkIcon />}
            label={t('actionCopyLink')}
            subtitle={url}
            onClick={() => void actions.copyLink(url)}
          />
        ))}
        {attachments.map((att) => (
          <AttachmentDownloadButton key={att.id} attachment={att} onSaved={close} />
        ))}
        {actions.canEdit && (
          <SheetBtn icon={<EditIcon className="h-5 w-5" />} label={t('actionEdit')} onClick={actions.edit} />
        )}
        {actions.canBookmark && (
          <SheetBtn
            icon={<BookmarkIcon className="h-5 w-5" filled={actions.isBookmarked} />}
            label={t(actions.isBookmarked ? 'actionRemoveBookmark' : 'actionSaveMessage')}
            onClick={() => void actions.bookmark()}
          />
        )}
        {actions.canPin && (
          <SheetBtn
            icon={<MessagePinIcon className="h-5 w-5" />}
            label={t(message.pinned ? 'actionUnpin' : 'actionPin')}
            onClick={() => void actions.pin()}
          />
        )}
        {actions.canDelete && (
          <SheetBtn
            icon={<TrashIcon className="h-5 w-5" />}
            label={t('actionDelete')}
            onClick={() => setConfirmDelete(true)}
            danger
          />
        )}
      </div>
    </BottomSheet>
  )
}

function AttachmentDownloadButton({ attachment, onSaved }: { attachment: Attachment; onSaved: () => void }) {
  const { t } = useTranslation('common')
  const { preparing, saving, failed, download } = useMediaDownload(attachment.url, attachment.filename)
  return (
    <SheetBtn
      icon={<DownloadIcon />}
      label={t(preparing ? 'preparingDownload' : saving ? 'saving' : failed ? 'retryDownload' : 'download')}
      subtitle={attachment.filename}
      disabled={preparing || saving}
      onClick={() => {
        void download().then((saved) => {
          if (saved) onSaved()
        })
      }}
    />
  )
}
