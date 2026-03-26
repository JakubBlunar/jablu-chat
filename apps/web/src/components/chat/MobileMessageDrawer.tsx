import type { Message } from '@chat/shared'
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { getSocket } from '@/lib/socket'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))

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
  onClose: () => void
  onEdit?: () => void
  onReply: () => void
}

export function MobileMessageDrawer({
  message,
  contextId,
  mode,
  isAuthor,
  isAdminOrOwner,
  onClose,
  onEdit,
  onReply
}: MobileMessageDrawerProps) {
  const isDm = mode === 'dm'
  const canDelete = isAuthor || isAdminOrOwner
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [visible, setVisible] = useState(false)

  const links = useMemo(() => {
    const contentLinks = extractLinks(message.content)
    const previewLinks = (message.linkPreviews ?? []).map((lp) => lp.url)
    return [...new Set([...contentLinks, ...previewLinks])]
  }, [message.content, message.linkPreviews])

  const attachments = message.attachments ?? []


  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [close])

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

  const handleCopy = useCallback(() => {
    if (message.content) navigator.clipboard.writeText(message.content)
    close()
  }, [message.content, close])

  const handleCopyLink = useCallback((url: string) => {
    navigator.clipboard.writeText(url)
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
    if (message.pinned) {
      getSocket()?.emit('message:unpin', { messageId: message.id, channelId: contextId })
    } else {
      getSocket()?.emit('message:pin', { messageId: message.id, channelId: contextId })
    }
    close()
  }, [message.id, message.pinned, contextId, close])

  const handleDelete = useCallback(() => {
    if (isDm) {
      getSocket()?.emit('dm:delete', { messageId: message.id, conversationId: contextId })
    } else {
      getSocket()?.emit('message:delete', { messageId: message.id })
    }
    close()
  }, [message.id, isDm, contextId, close])

  if (showFullPicker) {
    return createPortal(
      <div
        className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => {
          e.stopPropagation()
          if (e.target === e.currentTarget) {
            e.preventDefault()
            setShowFullPicker(false)
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          if (e.target === e.currentTarget) setShowFullPicker(false)
        }}
      >
        <Suspense fallback={null}>
          <EmojiPicker
            onSelect={handleReaction}
            onClose={() => setShowFullPicker(false)}
          />
        </Suspense>
      </div>,
      document.body
    )
  }

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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) {
          e.preventDefault()
          close()
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className={`w-full max-w-lg rounded-t-2xl bg-surface-dark pb-8 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ${visible ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-gray-600" />
        </div>

        {/* Quick emoji row — scrollable */}
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
            onClick={() => setShowFullPicker(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-light text-gray-400 active:bg-white/10"
            aria-label="More emojis"
          >
            <SmileIcon />
          </button>
        </div>

        <div className="border-t border-white/5" />

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 px-3 pt-3">
          <DrawerBtn icon={<ReplyIcon />} label="Reply" onClick={handleReply} />
          {message.content && (
            <DrawerBtn icon={<CopyIcon />} label="Copy Text" onClick={handleCopy} />
          )}
          {links.map((url) => (
            <DrawerBtn
              key={url}
              icon={<LinkIcon />}
              label={`Copy Link`}
              subtitle={url}
              onClick={() => handleCopyLink(url)}
            />
          ))}
          {attachments.map((att) => (
            <DrawerBtn
              key={att.id}
              icon={<DownloadIcon />}
              label={downloadLabel(att.type)}
              subtitle={att.filename}
              onClick={() => handleDownload(att.url, att.filename)}
            />
          ))}
          {isAuthor && onEdit && (
            <DrawerBtn icon={<EditIcon />} label="Edit Message" onClick={handleEdit} />
          )}
          {!isDm && isAdminOrOwner && (
            <DrawerBtn
              icon={<PinIcon />}
              label={message.pinned ? 'Unpin Message' : 'Pin Message'}
              onClick={handlePin}
            />
          )}
          {canDelete && (
            <DrawerBtn icon={<TrashIcon />} label="Delete Message" onClick={() => setConfirmDelete(true)} danger />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function DrawerBtn({
  icon,
  label,
  subtitle,
  onClick,
  danger
}: {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition active:brightness-125 ${danger ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-gray-200'}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {subtitle && (
          <span className="block truncate text-xs text-gray-500">{subtitle}</span>
        )}
      </span>
    </button>
  )
}

function SmileIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="9 17 4 12 9 7" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 1 1 0 0 0 1-1V4H7v1a1 1 0 0 0 1 1 1 1 0 0 1 1 1v3.76z" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
