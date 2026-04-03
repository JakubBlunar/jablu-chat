import type { Message } from '@chat/shared'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
import { ConfirmDialog } from '@/components/ui'
import { IconButton } from '@/components/ui/IconButton'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useEmojiStore } from '@/stores/emoji.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useServerStore } from '@/stores/server.store'
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
  const { has: hasPerm } = usePermissions(serverId)
  const isAuthor = message.authorId === userId
  const isAdminOrOwner = hasPerm(Permission.MANAGE_MESSAGES)
  const canDelete = isAuthor || isAdminOrOwner
  const isBookmarked = useBookmarkStore((s) => s.bookmarkedIds.has(message.id))
  const toggleBookmark = useBookmarkStore((s) => s.toggleBookmark)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const deleteBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [pickerAbove, setPickerAbove] = useState(true)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)

  const handleReply = useCallback(() => {
    onReply?.()
  }, [onReply])

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

  const customEmojis = useEmojiStore((s) => serverId ? s.getForServer(serverId) : [])

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
            <PinIcon />
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

function SmileIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4H7v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1v3.76z" />
    </svg>
  )
}

function ThreadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

