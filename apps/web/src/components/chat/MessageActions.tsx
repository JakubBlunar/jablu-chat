import type { Message } from '@chat/shared'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
import { ConfirmDialog } from '@/components/ui'
import { IconButton } from '@/components/ui/IconButton'
import {
  BookmarkIcon,
  EditIcon,
  ForwardIcon,
  LinkIcon,
  ShareIcon,
  MessagePinIcon,
  ReplyIcon,
  SmileIcon,
  ThreadIcon,
  TrashIcon,
} from '@/components/chat/chatIcons'
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal'
import { buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useShallow } from 'zustand/react/shallow'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useEmojiStore, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'
import { useThreadStore } from '@/stores/thread.store'

interface MessageActionsProps {
  message: Message
  channelId: string
  onEdit?: () => void
  onReply?: () => void
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
}

export function MessageActions({
  message,
  channelId,
  onEdit,
  onReply,
  hidePinAction,
  hideBookmarkAction
}: MessageActionsProps) {
  const userId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServerId)
  const channelLabel = useChannelStore((s) => {
    const ch = s.channels.find((c) => c.id === channelId)
    return ch ? `#${ch.name}` : '#channel'
  })
  const { has: hasPerm } = usePermissions(serverId)
  const isAuthor = message.authorId === userId
  const isAdminOrOwner = hasPerm(Permission.MANAGE_MESSAGES)
  const canDelete = isAuthor || isAdminOrOwner
  const { isBookmarked, toggleBookmark } = useBookmarkStore(
    useShallow((s) => ({
      isBookmarked: s.bookmarkedIds.has(message.id),
      toggleBookmark: s.toggleBookmark
    }))
  )
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const deleteBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [pickerAbove, setPickerAbove] = useState(true)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)

  const handleReply = useCallback(() => {
    onReply?.()
  }, [onReply])

  const shareableUrl =
    serverId != null
      ? getMessageShareUrl(
          buildMessageJumpPath('channel', { serverId, channelId, messageId: message.id })
        )
      : null

  const copyMessageLink = useCallback(() => {
    if (!shareableUrl) return
    void navigator.clipboard.writeText(shareableUrl).then(
      () => showToast('Link copied', 'Anyone with this link can jump to the message after signing in.'),
      () => showToast('Copy failed', 'Could not copy to clipboard.')
    )
  }, [shareableUrl])

  const shareMessage = useCallback(async () => {
    if (!shareableUrl) return
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `Message in ${channelLabel}`, url: shareableUrl })
        return
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
      }
    }
    copyMessageLink()
  }, [shareableUrl, channelLabel, copyMessageLink])

  const handleDelete = useCallback(() => {
    getSocket()?.emit('message:delete', { messageId: message.id }, (res?: { ok?: boolean }) => {
      if (res?.ok && message.threadParentId) {
        window.dispatchEvent(new CustomEvent('forum-reply:delete', { detail: message.id }))
      }
    })
    setShowDeleteConfirm(false)
  }, [message.id, message.threadParentId])

  const handlePin = useCallback(() => {
    if (message.pinned) {
      getSocket()?.emit('message:unpin', {
        messageId: message.id,
        channelId
      })
    } else {
      getSocket()?.emit('message:pin', {
        messageId: message.id,
        channelId
      })
    }
  }, [message.id, message.pinned, channelId])

  const openEmojiPicker = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPickerAbove(rect.top > 460)
      const width = 320
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))
      const top = rect.top > 460 ? rect.top - 8 : rect.bottom + 8
      setPickerPos({ top, left })
    }
    setShowEmojiPicker((p) => !p)
  }, [])

  const customEmojis = useEmojiStore((s) => serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS)

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      getSocket()?.emit('reaction:toggle', {
        messageId: message.id,
        emoji
      })
      setShowEmojiPicker(false)
    },
    [message.id]
  )

  const handleCustomReaction = useCallback(
    (name: string) => {
      getSocket()?.emit('reaction:toggle', {
        messageId: message.id,
        emoji: name,
        isCustom: true
      })
      setShowEmojiPicker(false)
    },
    [message.id]
  )

  useEffect(() => {
    if (!showEmojiPicker) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowEmojiPicker(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showEmojiPicker])

  useEffect(() => {
    if (!showEmojiPicker || !pickerPos || !pickerRef.current) return
    const rect = pickerRef.current.getBoundingClientRect()
    let nextLeft = pickerPos.left
    if (rect.right > window.innerWidth - 8) {
      nextLeft -= rect.right - (window.innerWidth - 8)
    }
    if (rect.left < 8) {
      nextLeft += 8 - rect.left
    }
    if (Math.abs(nextLeft - pickerPos.left) > 1) {
      setPickerPos((prev) => (prev ? { ...prev, left: nextLeft } : prev))
    }
  }, [showEmojiPicker, pickerPos])

  return (
    <div ref={btnRef} className="absolute right-2 top-0 z-10 flex items-start">
      <div className="flex items-center gap-0.5 rounded bg-surface-dark shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <IconButton label="React" onClick={openEmojiPicker}>
          <SmileIcon />
        </IconButton>
        <IconButton label="Reply" onClick={handleReply}>
          <ReplyIcon />
        </IconButton>
        {shareableUrl && (
          <IconButton label="Copy message link" onClick={copyMessageLink}>
            <LinkIcon className="h-4 w-4" />
          </IconButton>
        )}
        {shareableUrl && (
          <IconButton label="Share message" onClick={() => void shareMessage()}>
            <ShareIcon />
          </IconButton>
        )}
        {serverId && (
          <IconButton label="Forward to channel" onClick={() => setShowForwardModal(true)}>
            <ForwardIcon />
          </IconButton>
        )}
        {!message.threadParentId && (
          <IconButton
            label={message.threadCount ? 'View Thread' : 'Reply in Thread'}
            onClick={() => useThreadStore.getState().openThread(channelId, message)}
          >
            <ThreadIcon />
          </IconButton>
        )}
        {isAuthor && onEdit && (
          <IconButton label="Edit" onClick={onEdit}>
            <EditIcon />
          </IconButton>
        )}
        {isAdminOrOwner && !hidePinAction && (
          <IconButton label={message.pinned ? 'Unpin' : 'Pin'} onClick={handlePin}>
            <MessagePinIcon />
          </IconButton>
        )}
        {!hideBookmarkAction && (
          <IconButton label={isBookmarked ? 'Remove Bookmark' : 'Bookmark'} onClick={() => void toggleBookmark(message.id)}>
            <BookmarkIcon filled={isBookmarked} />
          </IconButton>
        )}
        {canDelete && (
          <IconButton ref={deleteBtnRef} label="Delete" variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            <TrashIcon />
          </IconButton>
        )}
      </div>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Message"
          description="Are you sure? This cannot be undone."
          confirmLabel="Delete"
          anchorRef={deleteBtnRef}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showForwardModal && (
        <ForwardMessageModal
          message={message}
          sourceChannelId={channelId}
          onClose={() => setShowForwardModal(false)}
        />
      )}
      {showEmojiPicker && pickerPos && createPortal(
        <div
          ref={pickerRef}
          className="fixed z-[130]"
          style={{
            left: pickerPos.left,
            top: pickerAbove ? undefined : pickerPos.top,
            bottom: pickerAbove ? window.innerHeight - pickerPos.top : undefined
          }}
        >
          <Suspense fallback={null}>
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={() => setShowEmojiPicker(false)}
              customEmojis={customEmojis}
              reactionMode
              onCustomSelect={handleCustomReaction}
            />
          </Suspense>
        </div>,
        document.body
      )}
    </div>
  )
}
