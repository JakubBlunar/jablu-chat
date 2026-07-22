import type { Message } from '@chat/shared'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Spinner } from '@/components/ui'

const EmojiPicker = lazyWithRetry(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))

function PickerLoading() {
  return (
    <div className="flex h-24 w-[340px] max-w-[80vw] items-center justify-center rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10">
      <Spinner size="md" />
    </div>
  )
}
import { ConfirmDialog } from '@/components/ui'
import { IconButton } from '@/components/ui/IconButton'
import {
  BookmarkIcon,
  CopyIcon,
  EditIcon,
  ForwardIcon,
  LinkIcon,
  MoreIcon,
  ShareIcon,
  MessagePinIcon,
  ReplyIcon,
  SmileIcon,
  ThreadIcon,
  TrashIcon,
} from '@/components/chat/chatIcons'
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal'
import { MessageActionsMenu, type MessageMenuItem } from '@/components/chat/MessageActionsMenu'
import { buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { getSocket } from '@/lib/socket'
import { toggleMessageReaction } from '@/lib/reactions'
import { useAuthStore } from '@/stores/auth.store'
import { useShallow } from 'zustand/react/shallow'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useEmojiStore, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { addRecentReaction, useRecentReactions } from '@/stores/reactions.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'
import { useThreadStore } from '@/stores/thread.store'

interface MessageActionsProps {
  message: Message
  /** Channel messages vs direct messages. */
  mode: 'channel' | 'dm'
  /** channelId (channel mode) or conversationId (dm mode). */
  contextId: string
  onEdit?: () => void
  onReply?: () => void
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
}

export function MessageActions({
  message,
  mode,
  contextId,
  onEdit,
  onReply,
  hidePinAction,
  hideBookmarkAction
}: MessageActionsProps) {
  const { t } = useTranslation('chat')
  const isDm = mode === 'dm'
  const userId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServerId)
  const channelLabel = useChannelStore((s) => {
    if (isDm) return null
    const ch = s.channels.find((c) => c.id === contextId)
    return ch ? `#${ch.name}` : '#channel'
  })
  const { has: hasPerm } = usePermissions(isDm ? null : serverId)
  const isAuthor = message.authorId === userId
  const isAdminOrOwner = !isDm && hasPerm(Permission.MANAGE_MESSAGES)
  const canDelete = isDm ? isAuthor : isAuthor || isAdminOrOwner
  const recent = useRecentReactions()
  const { isBookmarked, toggleBookmark } = useBookmarkStore(
    useShallow((s) => ({
      isBookmarked: s.bookmarkedIds.has(message.id),
      toggleBookmark: s.toggleBookmark
    }))
  )
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const [pickerAbove, setPickerAbove] = useState(true)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)

  const handleReply = useCallback(() => {
    onReply?.()
  }, [onReply])

  const shareableUrl = useMemo(() => {
    if (isDm) {
      return getMessageShareUrl(
        buildMessageJumpPath('dm', { conversationId: contextId, messageId: message.id })
      )
    }
    return serverId != null
      ? getMessageShareUrl(
          buildMessageJumpPath('channel', { serverId, channelId: contextId, messageId: message.id })
        )
      : null
  }, [isDm, serverId, contextId, message.id])

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
        await navigator.share({
          title: isDm ? 'Direct message' : `Message in ${channelLabel}`,
          url: shareableUrl
        })
        return
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
      }
    }
    copyMessageLink()
  }, [shareableUrl, isDm, channelLabel, copyMessageLink])

  const handleCopyText = useCallback(() => {
    if (!message.content) return
    void navigator.clipboard.writeText(message.content).then(
      () => showToast('Copied', 'Message text copied to clipboard.'),
      () => showToast('Copy failed', 'Could not copy to clipboard.')
    )
  }, [message.content])

  const handleDelete = useCallback(() => {
    if (isDm) {
      getSocket()?.emit('dm:delete', { messageId: message.id, conversationId: contextId })
    } else {
      getSocket()?.emit('message:delete', { messageId: message.id }, (res?: { ok?: boolean }) => {
        if (res?.ok && message.threadParentId) {
          window.dispatchEvent(new CustomEvent('forum-reply:delete', { detail: message.id }))
        }
      })
    }
    setShowDeleteConfirm(false)
  }, [isDm, message.id, message.threadParentId, contextId])

  const handlePin = useCallback(() => {
    if (isDm) {
      const event = message.pinned ? 'dm:unpin' : 'dm:pin'
      getSocket()?.emit(event, { messageId: message.id, conversationId: contextId })
    } else {
      const event = message.pinned ? 'message:unpin' : 'message:pin'
      getSocket()?.emit(event, { messageId: message.id, channelId: contextId })
    }
  }, [isDm, message.id, message.pinned, contextId])

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

  const customEmojis = useEmojiStore((s) => (serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS))

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      toggleMessageReaction({ mode, messageId: message.id, emoji })
      addRecentReaction(emoji)
      setShowEmojiPicker(false)
    },
    [mode, message.id]
  )

  const handleCustomReaction = useCallback(
    (name: string) => {
      toggleMessageReaction({ mode, messageId: message.id, emoji: name, isCustom: true })
      setShowEmojiPicker(false)
    },
    [mode, message.id]
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

  const menuItems = useMemo<MessageMenuItem[]>(() => {
    const items: MessageMenuItem[] = []
    items.push({ id: 'react', label: t('actionAddReaction'), icon: <SmileIcon />, onClick: openEmojiPicker })
    items.push({ id: 'reply', label: t('actionReply'), icon: <ReplyIcon />, onClick: handleReply })
    if (!isDm && serverId) {
      items.push({
        id: 'forward',
        label: t('actionForward'),
        icon: <ForwardIcon />,
        onClick: () => setShowForwardModal(true)
      })
    }
    if (!isDm && !message.threadParentId) {
      items.push({
        id: 'thread',
        label: message.threadCount ? t('actionViewThread') : t('actionCreateThread'),
        icon: <ThreadIcon />,
        onClick: () => useThreadStore.getState().openThread(contextId, message)
      })
    }
    if (message.content) {
      items.push({ id: 'copy-text', label: t('actionCopyText'), icon: <CopyIcon className="h-4 w-4" />, onClick: handleCopyText })
    }
    if (isAuthor && onEdit) {
      items.push({ id: 'edit', label: t('actionEdit'), icon: <EditIcon />, onClick: onEdit })
    }
    const canPin = isDm ? !hidePinAction : isAdminOrOwner && !hidePinAction
    if (canPin) {
      items.push({
        id: 'pin',
        label: message.pinned ? t('actionUnpin') : t('actionPin'),
        icon: <MessagePinIcon />,
        onClick: handlePin
      })
    }
    if (!hideBookmarkAction) {
      items.push({
        id: 'bookmark',
        label: isBookmarked ? t('actionRemoveBookmark') : t('actionSaveMessage'),
        icon: <BookmarkIcon filled={isBookmarked} />,
        onClick: () => void toggleBookmark(message.id)
      })
    }
    if (shareableUrl) {
      items.push({ id: 'copy-link', label: t('actionCopyMessageLink'), icon: <LinkIcon className="h-4 w-4" />, onClick: copyMessageLink })
      items.push({ id: 'share', label: t('actionShareMessage'), icon: <ShareIcon />, onClick: () => void shareMessage() })
    }
    if (canDelete) {
      items.push({ id: 'delete', label: t('actionDelete'), icon: <TrashIcon />, danger: true, onClick: () => setShowDeleteConfirm(true) })
    }
    return items
  }, [
    t,
    isDm,
    serverId,
    message,
    contextId,
    isAuthor,
    onEdit,
    hidePinAction,
    isAdminOrOwner,
    hideBookmarkAction,
    isBookmarked,
    shareableUrl,
    canDelete,
    openEmojiPicker,
    handleReply,
    handleCopyText,
    handlePin,
    toggleBookmark,
    copyMessageLink,
    shareMessage
  ])

  return (
    <div ref={btnRef} className="absolute right-2 top-0 z-10 flex items-start">
      <div className="flex items-center gap-0.5 rounded bg-surface-dark p-0.5 shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {recent.map((emoji) => (
          <button
            key={emoji}
            type="button"
            title={t('actionAddReaction')}
            aria-label={`${t('actionAddReaction')} ${emoji}`}
            onClick={() => handleEmojiSelect(emoji)}
            className="flex h-7 w-7 items-center justify-center rounded text-[1.05rem] leading-none transition hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
        <IconButton label={t('actionAddReaction')} onClick={openEmojiPicker}>
          <SmileIcon />
        </IconButton>
        <IconButton label={t('actionReply')} onClick={handleReply}>
          <ReplyIcon />
        </IconButton>
        <IconButton
          ref={moreBtnRef}
          label={t('actionMore')}
          active={showMenu}
          onClick={() => setShowMenu((p) => !p)}
        >
          <MoreIcon />
        </IconButton>
      </div>
      {showMenu && (
        <MessageActionsMenu anchorRef={moreBtnRef} items={menuItems} onClose={() => setShowMenu(false)} />
      )}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Message"
          description="Are you sure? This cannot be undone."
          confirmLabel="Delete"
          anchorRef={moreBtnRef}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {showForwardModal && (
        <ForwardMessageModal
          message={message}
          sourceChannelId={contextId}
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
          <ErrorBoundary
            fallback={null}
            onError={() => {
              setShowEmojiPicker(false)
              showToast('Emoji picker', 'Failed to load. Please check your connection and try again.')
            }}
          >
            <Suspense fallback={<PickerLoading />}>
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={() => setShowEmojiPicker(false)}
                customEmojis={isDm ? undefined : customEmojis}
                reactionMode
                onCustomSelect={isDm ? undefined : handleCustomReaction}
              />
            </Suspense>
          </ErrorBoundary>
        </div>,
        document.body
      )}
    </div>
  )
}
