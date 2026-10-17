import type { Attachment, Message } from '@chat/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDownload } from '@/hooks/useMediaDownload'
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal'
import { TranslateModal } from '@/components/chat/TranslateModal'
import { buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { copyMessageContent, shareMessageLink } from '@/lib/messageClipboard'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import { useMessageDeletion } from '@/components/chat/hooks/useMessageDeletion'
import { toggleMessageReaction } from '@/lib/reactions'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import { useShallow } from 'zustand/react/shallow'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useServerStore } from '@/stores/server.store'
import { useTranslationStore } from '@/stores/translation.store'
import { showToast } from '@/stores/toast.store'
import { setMessagePinned } from '@/lib/messagePins'
import { useThreadStore } from '@/stores/thread.store'
import { addRecentReaction } from '@/stores/reactions.store'
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

interface MobileMessageDrawerProps {
  message: Message
  contextId: string
  mode: 'channel' | 'dm'
  isAuthor: boolean
  isAdminOrOwner: boolean
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
  onClose: () => void
  onEdit?: () => void
  onReply: () => void
  onOpenEmojiPicker?: () => void
}

export function MobileMessageDrawer({
  message,
  contextId,
  mode,
  isAuthor,
  isAdminOrOwner,
  hidePinAction,
  hideBookmarkAction,
  onClose,
  onEdit,
  onReply,
  onOpenEmojiPicker
}: MobileMessageDrawerProps) {
  const { t } = useTranslation('chat')
  const isDm = mode === 'dm'
  const canDelete = isAuthor || (!isDm && isAdminOrOwner)
  const deletion = useMessageDeletion(mode, contextId, message, onClose)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [forwardOpen, setForwardOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [reactionPending, setReactionPending] = useState(false)
  const serverId = useServerStore((s) => s.currentServerId)
  const translationEnabled = useTranslationStore((s) => s.capabilities?.enabled ?? false)
  const translationLoaded = useTranslationStore((s) => s.capabilitiesLoaded)
  const translationSetupError = useTranslationStore((s) => s.capabilitiesError || s.preferenceError)
  const defaultTarget = useTranslationStore((s) => s.targetLang)
  const translate = useTranslationStore((s) => s.translate)

  // The desktop `MessageActions` (which lives only on the `!isMobile` path) is
  // the component that normally fetches translation capabilities. On mobile
  // that path never mounts, so the Translate button — gated on
  // `capabilitiesLoaded` — would be permanently hidden. Fetch here when the
  // drawer opens. No-op if a prior open (or desktop) already loaded them.
  useEffect(() => {
    const store = useTranslationStore.getState()
    void store.fetchCapabilities()
    void store.loadPreference()
  }, [])

  const messageJumpUrl = useMemo(() => {
    if (isDm) {
      return getMessageShareUrl(
        buildMessageJumpPath('dm', {
          conversationId: contextId,
          messageId: message.id,
          threadParentId: message.threadParentId
        })
      )
    }
    if (serverId) {
      return getMessageShareUrl(
        buildMessageJumpPath('channel', {
          serverId,
          channelId: contextId,
          messageId: message.id,
          threadParentId: message.threadParentId
        })
      )
    }
    return null
  }, [isDm, serverId, contextId, message.id, message.threadParentId])
  const links = useMemo(() => {
    const contentLinks = extractLinks(message.content)
    const previewLinks = (message.linkPreviews ?? []).map((lp) => lp.url)
    return [...new Set([...contentLinks, ...previewLinks])]
  }, [message.content, message.linkPreviews])

  const attachments = message.attachments ?? []

  const close = onClose

  const handleReaction = useCallback(
    async (emoji: string) => {
      if (reactionPending) return
      setReactionPending(true)
      try {
        if (await toggleMessageReaction({ mode, messageId: message.id, emoji })) {
          addRecentReaction(emoji)
          close()
        }
      } finally {
        setReactionPending(false)
      }
    },
    [mode, message.id, close, reactionPending]
  )

  const handleReply = useCallback(() => {
    onReply()
    close()
  }, [onReply, close])

  const handleThread = useCallback(() => {
    useThreadStore.getState().openThread(contextId, message)
    close()
  }, [contextId, message, close])

  const handleCopy = useCallback(async () => {
    if (message.content && (await copyMessageContent(message.content))) close()
  }, [message.content, close])

  const handleCopyLink = useCallback(
    async (url: string) => {
      if (await copyMessageContent(url, true)) close()
    },
    [close]
  )

  const handleCopyMessageJumpLink = useCallback(async () => {
    if (!messageJumpUrl) return
    if (await copyMessageContent(messageJumpUrl, true)) close()
  }, [messageJumpUrl, close])

  const handleShareMessageJump = useCallback(async () => {
    if (!messageJumpUrl) return
    if (await shareMessageLink(messageJumpUrl, t(isDm ? 'directMessage' : 'messageShareGenericTitle'))) close()
  }, [messageJumpUrl, isDm, close, t])

  const handleEdit = useCallback(() => {
    onEdit?.()
    close()
  }, [onEdit, close])

  const handleTranslate = useCallback(() => {
    if (defaultTarget) {
      void translate(message.id, defaultTarget, messageTranslationVersion(message)).then((err) => {
        if (err) showToast(t('translateErrorTitle'), t('translateErrorMessage'))
        else close()
      })
    } else {
      setTranslateOpen(true)
    }
  }, [defaultTarget, translate, message, t, close])

  const handlePin = useCallback(() => {
    void setMessagePinned(mode, contextId, message.id, !message.pinned)
      .then(close)
      .catch((error) => {
        console.error('Failed to update message pin', error)
        showToast(t('pinnedMessagesTitle'), t('pinActionFailed'))
      })
  }, [message.id, message.pinned, mode, contextId, close, t])

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
            disabled={reactionPending}
            aria-label={`${t('actionAddReaction')} ${emoji}`}
            onClick={() => void handleReaction(emoji)}
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
        <SheetBtn icon={<ReplyIcon className="h-5 w-5" />} label={t('actionReply')} onClick={handleReply} />
        {!isDm && !message.threadParentId && (
          <SheetBtn
            icon={<ThreadIcon className="h-5 w-5" />}
            label={t((message.threadCount ?? 0) > 0 ? 'actionViewThread' : 'actionCreateThread')}
            onClick={handleThread}
          />
        )}
        {!isDm && serverId && (
          <SheetBtn
            icon={<ForwardIcon className="h-5 w-5" />}
            label={t('actionForward')}
            onClick={() => setForwardOpen(true)}
          />
        )}
        {messageJumpUrl && (
          <SheetBtn icon={<LinkIcon />} label={t('actionCopyMessageLink')} onClick={handleCopyMessageJumpLink} />
        )}
        {messageJumpUrl && (
          <SheetBtn
            icon={<ShareIcon className="h-5 w-5" />}
            label={t('actionShareMessage')}
            onClick={() => void handleShareMessageJump()}
          />
        )}
        {message.content && <SheetBtn icon={<CopyIcon />} label={t('actionCopyText')} onClick={handleCopy} />}
        {message.content && translationLoaded && translationEnabled && (
          <SheetBtn icon={<GlobeIcon className="h-5 w-5" />} label={t('actionTranslate')} onClick={handleTranslate} />
        )}
        {translationSetupError && (
          <SheetBtn
            icon={<GlobeIcon />}
            label={t('translationSetupRetry')}
            onClick={() => {
              const store = useTranslationStore.getState()
              void Promise.all([store.fetchCapabilities(), store.loadPreference()])
            }}
          />
        )}
        {links.map((url) => (
          <SheetBtn
            key={url}
            icon={<LinkIcon />}
            label={t('actionCopyLink')}
            subtitle={url}
            onClick={() => handleCopyLink(url)}
          />
        ))}
        {attachments.map((att) => (
          <AttachmentDownloadButton key={att.id} attachment={att} onSaved={close} />
        ))}
        {isAuthor && onEdit && (
          <SheetBtn icon={<EditIcon className="h-5 w-5" />} label={t('actionEdit')} onClick={handleEdit} />
        )}
        {!hideBookmarkAction && <BookmarkDrawerBtn messageId={message.id} onClose={close} />}
        {!hidePinAction && (isDm || isAdminOrOwner) && (
          <SheetBtn
            icon={<MessagePinIcon className="h-5 w-5" />}
            label={t(message.pinned ? 'actionUnpin' : 'actionPin')}
            onClick={handlePin}
          />
        )}
        {canDelete && (
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

function BookmarkDrawerBtn({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { t } = useTranslation('chat')
  const { isBookmarked, toggleBookmark } = useBookmarkStore(
    useShallow((s) => ({
      isBookmarked: s.bookmarkedIds.has(messageId),
      toggleBookmark: s.toggleBookmark
    }))
  )
  return (
    <SheetBtn
      icon={<BookmarkIcon className="h-5 w-5" filled={isBookmarked} />}
      label={t(isBookmarked ? 'actionRemoveBookmark' : 'actionSaveMessage')}
      onClick={() => {
        void toggleBookmark(messageId)
          .then(onClose)
          .catch((error) => {
            console.error('Failed to update saved message', error)
            showToast(t('savedMessagesTitle'), t('bookmarkActionFailed'))
          })
      }}
    />
  )
}
