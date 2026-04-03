import type { Message } from '@chat/shared'
import { useCallback, useMemo, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import { useShallow } from 'zustand/react/shallow'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useThreadStore } from '@/stores/thread.store'
import {
  BookmarkIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  LinkIcon,
  MessagePinIcon,
  ReplyIcon,
  SmileIcon,
  ThreadIcon,
  TrashIcon,
} from '@/components/chat/chatIcons'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👀', '🎉']

const URL_RE = /https?:\/\/[^\s<>)"']+/gi

function extractLinks(content: string | null): string[] {
  if (!content) return []
  const matches = content.match(URL_RE)
  return matches ? [...new Set(matches)] : []
}

function downloadLabel(type: string): string {
  switch (type) {
    case 'image': return 'Save Image'
    case 'gif': return 'Save GIF'
    case 'video': return 'Save Video'
    default: return 'Download File'
  }
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
  const isDm = mode === 'dm'
  const canDelete = isAuthor || isAdminOrOwner
  const [confirmDelete, setConfirmDelete] = useState(false)
  const links = useMemo(() => {
    const contentLinks = extractLinks(message.content)
    const previewLinks = (message.linkPreviews ?? []).map((lp) => lp.url)
    return [...new Set([...contentLinks, ...previewLinks])]
  }, [message.content, message.linkPreviews])

  const attachments = message.attachments ?? []

  const close = onClose

  const handleReaction = useCallback(
    (emoji: string) => {
      getSocket()?.emit('reaction:toggle', { messageId: message.id, emoji })
      close()
    },
    [message.id, close]
  )

  const handleReply = useCallback(() => {
    onReply()
    close()
  }, [onReply, close])

  const handleThread = useCallback(() => {
    useThreadStore.getState().openThread(contextId, message)
    close()
  }, [contextId, message, close])

  const handleCopy = useCallback(() => {
    if (message.content) {
      try { navigator.clipboard.writeText(message.content) } catch {}
    }
    close()
  }, [message.content, close])

  const handleCopyLink = useCallback((url: string) => {
    try { navigator.clipboard.writeText(url) } catch {}
    close()
  }, [close])

  const handleDownload = useCallback((url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    close()
  }, [close])

  const handleEdit = useCallback(() => {
    onEdit?.()
    close()
  }, [onEdit, close])

  const handlePin = useCallback(() => {
    if (isDm) {
      const event = message.pinned ? 'dm:unpin' : 'dm:pin'
      getSocket()?.emit(event, { messageId: message.id, conversationId: contextId })
    } else {
      const event = message.pinned ? 'message:unpin' : 'message:pin'
      getSocket()?.emit(event, { messageId: message.id, channelId: contextId })
    }
    close()
  }, [message.id, message.pinned, isDm, contextId, close])

  const handleDelete = useCallback(() => {
    if (isDm) {
      getSocket()?.emit('dm:delete', { messageId: message.id, conversationId: contextId })
    } else {
      getSocket()?.emit('message:delete', { messageId: message.id })
    }
    close()
  }, [message.id, isDm, contextId, close])

  if (confirmDelete) {
    return (
      <ConfirmDialog
        title="Delete Message"
        description="Are you sure you want to delete this message? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
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
            onClick={() => handleReaction(emoji)}
            className="shrink-0 rounded-full p-2 text-2xl active:scale-110 active:bg-white/10"
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { onClose(); onOpenEmojiPicker?.() }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-light text-gray-400 active:bg-white/10"
          aria-label="More emojis"
        >
          <SmileIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="border-t border-white/5" />

      <div className="flex flex-col gap-1.5 px-3 pt-3">
        <SheetBtn icon={<ReplyIcon className="h-5 w-5" />} label="Reply" onClick={handleReply} />
        {!isDm && !message.threadParentId && (
          <SheetBtn
            icon={<ThreadIcon className="h-5 w-5" />}
            label={(message.threadCount ?? 0) > 0 ? 'View Thread' : 'Reply in Thread'}
            onClick={handleThread}
          />
        )}
        {message.content && (
          <SheetBtn icon={<CopyIcon />} label="Copy Text" onClick={handleCopy} />
        )}
        {links.map((url) => (
          <SheetBtn
            key={url}
            icon={<LinkIcon />}
            label="Copy Link"
            subtitle={url}
            onClick={() => handleCopyLink(url)}
          />
        ))}
        {attachments.map((att) => (
          <SheetBtn
            key={att.id}
            icon={<DownloadIcon />}
            label={downloadLabel(att.type)}
            subtitle={att.filename}
            onClick={() => handleDownload(att.url, att.filename)}
          />
        ))}
        {isAuthor && onEdit && (
          <SheetBtn icon={<EditIcon className="h-5 w-5" />} label="Edit Message" onClick={handleEdit} />
        )}
        {!hideBookmarkAction && <BookmarkDrawerBtn messageId={message.id} onClose={close} />}
        {!hidePinAction && (isDm || isAdminOrOwner) && (
          <SheetBtn
            icon={<MessagePinIcon className="h-5 w-5" />}
            label={message.pinned ? 'Unpin Message' : 'Pin Message'}
            onClick={handlePin}
          />
        )}
        {canDelete && (
          <SheetBtn icon={<TrashIcon className="h-5 w-5" />} label="Delete Message" onClick={() => setConfirmDelete(true)} danger />
        )}
      </div>
    </BottomSheet>
  )
}

function BookmarkDrawerBtn({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { isBookmarked, toggleBookmark } = useBookmarkStore(
    useShallow((s) => ({
      isBookmarked: s.bookmarkedIds.has(messageId),
      toggleBookmark: s.toggleBookmark
    }))
  )
  return (
    <SheetBtn
      icon={<BookmarkIcon className="h-5 w-5" filled={isBookmarked} />}
      label={isBookmarked ? 'Remove Bookmark' : 'Save Message'}
      onClick={() => { void toggleBookmark(messageId); onClose() }}
    />
  )
}
