import type { Message } from '@chat/shared'
import { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard, isImageUrl, isGifUrl } from '@/components/LinkPreviewCard'
import { MarkdownContent, type ChannelRef } from '@/components/MarkdownContent'
import type { RoleMentionRef } from '@/lib/markdownMentions'
import { MessageActions } from '@/components/chat/MessageActions'
import { MobileMessageDrawer } from '@/components/chat/MobileMessageDrawer'
import { MessageEmbedCard } from '@/components/chat/MessageEmbed'
import { PollDisplay } from '@/components/chat/PollDisplay'
import { resolveMediaUrl } from '@/lib/api'
import type { CustomEmoji } from '@/lib/api/types'
import { useEmojiStore, buildNameMap, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { UserAvatar } from '@/components/UserAvatar'
import { useIsMobile } from '@/hooks/useMobile'
import { formatSmartTimestamp, formatTimeOnly } from '@/lib/format-time'
import { getSocket } from '@/lib/socket'
import { usernameAccentStyle } from '@/lib/username-color'
import { useAuthStore } from '@/stores/auth.store'
import { getRoleColor, useMemberStore } from '@/stores/member.store'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'
import { buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { ConfirmDialog, IconButton } from '@/components/ui'
import {
  EditIcon,
  LinkIcon,
  MessagePinIcon,
  ReplyIcon,
  ShareIcon,
  SmileIcon,
  TrashIcon,
} from '@/components/chat/chatIcons'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))

export const MessageRow = memo(function MessageRow({
  mode,
  message,
  showHead,
  contextId,
  onReply,
  onUserClick,
  onMentionClick,
  channels,
  onChannelClick,
  membersByUsername,
  hideThreadAction,
  hidePinAction,
  hideBookmarkAction
}: {
  mode: 'channel' | 'dm'
  message: Message
  showHead: boolean
  contextId: string
  onReply: (msg: Message) => void
  onUserClick?: (authorId: string, rect: DOMRect) => void
  onMentionClick?: (username: string, rect: DOMRect) => void
  channels?: ChannelRef[]
  onChannelClick?: (serverId: string, channelId: string) => void
  membersByUsername?: Map<string, import('@/stores/member.store').Member>
  hideThreadAction?: boolean
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
}) {
  const userId = useAuthStore((s) => s.user?.id)
  const isDm = mode === 'dm'
  const isWebhook = !isDm && !!message.webhookId && !!message.webhook
  const isAuthor = message.authorId === userId
  const name = isWebhook
    ? message.webhook!.name
    : (message.author?.displayName ?? message.author?.username ?? 'Deleted User')
  const avatarUrl = isWebhook ? message.webhook!.avatarUrl : (message.author?.avatarUrl ?? null)
  const storeMembers = useMemberStore((s) => s.members)
  const authorRoleColor = useMemo(() => {
    const member = storeMembers.find((m) => m.userId === message.authorId)
    if (!member) return null
    return getRoleColor(member)
  }, [storeMembers, message.authorId])

  const rolesByLowerName = useMemo(() => {
    if (isDm) return undefined
    const map = new Map<string, RoleMentionRef>()
    for (const m of storeMembers) {
      for (const r of m.roles ?? []) {
        if (r.isDefault) continue
        map.set(r.name.toLowerCase(), { id: r.id, name: r.name, color: r.color })
      }
    }
    return map
  }, [isDm, storeMembers])
  const attachments = message.attachments ?? []
  const reactions = message.reactions ?? []
  const linkPreviews = message.linkPreviews ?? []

  const contentIsMediaLink = useMemo(() => {
    const text = message.content?.trim()
    if (!text || linkPreviews.length !== 1) return false
    const lp = linkPreviews[0]
    if (text !== lp.url) return false
    return isImageUrl(lp) || isGifUrl(lp)
  }, [message.content, linkPreviews])

  const isMobile = useIsMobile()
  const serverId = useServerStore((s) => s.currentServerId)
  const emojiArr = useEmojiStore((s) => serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS)
  const customEmojiMap = useMemo(
    () => (emojiArr.length > 0 ? buildNameMap(emojiArr) : undefined),
    [emojiArr]
  )

  const dmShareUrl = useMemo(() => {
    if (!isDm) return null
    return getMessageShareUrl(
      buildMessageJumpPath('dm', { conversationId: contextId, messageId: message.id })
    )
  }, [isDm, contextId, message.id])

  const copyDmMessageLink = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!dmShareUrl) return
      void navigator.clipboard.writeText(dmShareUrl).then(
        () => showToast('Link copied', 'Anyone with this link can jump to the message after signing in.'),
        () => showToast('Copy failed', 'Could not copy to clipboard.')
      )
    },
    [dmShareUrl]
  )

  const shareDmMessage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!dmShareUrl) return
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Direct message', url: dmShareUrl })
          return
        } catch (err) {
          if ((err as { name?: string }).name === 'AbortError') return
        }
      }
      copyDmMessageLink(e)
    },
    [dmShareUrl, copyDmMessageLink]
  )
  const { has: hasPerm } = usePermissions(isDm ? null : serverId)
  const isAdminOrOwner = hasPerm(Permission.MANAGE_MESSAGES)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [pickerAbove, setPickerAbove] = useState(true)
  const actionsRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const deleteBtnRef = useRef<HTMLButtonElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileEmojiPicker, setMobileEmojiPicker] = useState(false)

  const handleStartEdit = useCallback(() => {
    setEditValue(message.content ?? '')
    setEditing(true)
  }, [message.content])

  const handleSaveEdit = useCallback(() => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === message.content) {
      setEditing(false)
      return
    }
    if (isDm) {
      getSocket()?.emit('dm:edit', { messageId: message.id, conversationId: contextId, content: trimmed })
    } else {
      getSocket()?.emit('message:edit', { messageId: message.id, content: trimmed })
    }
    setEditing(false)
  }, [editValue, message.id, message.content, isDm, contextId])

  const handleDelete = useCallback(() => {
    if (isDm) {
      getSocket()?.emit('dm:delete', { messageId: message.id, conversationId: contextId })
    } else {
      getSocket()?.emit('message:delete', { messageId: message.id })
    }
    setShowDeleteConfirm(false)
  }, [message.id, isDm, contextId])

  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    }
  }, [editing, editValue])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleTouchStart = useCallback(() => {
    if (!isMobile || editing) return
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setDrawerOpen(true)
    }, 500)
  }, [isMobile, editing])

  const handleTouchEnd = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleTouchMove = useCallback(() => {
    cancelLongPress()
  }, [cancelLongPress])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (longPressTimer.current || longPressFired.current) e.preventDefault()
  }, [])

  const handleRowClick = useCallback((e: React.MouseEvent) => {
    if (longPressFired.current) {
      e.stopPropagation()
      longPressFired.current = false
    }
  }, [])

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!message.authorId || !onUserClick) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      onUserClick(message.authorId, rect)
    },
    [message.authorId, onUserClick]
  )

  return (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      onClick={handleRowClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onContextMenu={handleContextMenu}
      className={`group relative flex gap-4 rounded-md px-2 py-0.5 transition ${
        editing ? 'bg-white/[0.02]' : 'hover:bg-white/[0.03]'
      } ${showHead ? 'mt-3 first:mt-1' : '-mt-0.5'}`}
    >
      {drawerOpen && (
        <MobileMessageDrawer
          message={message}
          contextId={contextId}
          mode={mode}
          isAuthor={isAuthor}
          isAdminOrOwner={isAdminOrOwner}
          hidePinAction={hidePinAction}
          hideBookmarkAction={hideBookmarkAction}
          onClose={() => setDrawerOpen(false)}
          onEdit={isAuthor ? handleStartEdit : undefined}
          onReply={() => onReply(message)}
          onOpenEmojiPicker={() => setMobileEmojiPicker(true)}
        />
      )}
      {mobileEmojiPicker && (
        <MobileEmojiPickerOverlay
          messageId={message.id}
          onClose={() => setMobileEmojiPicker(false)}
        />
      )}
      {!editing && !isMobile &&
        (!isDm ? (
          <MessageActions
            message={message}
            channelId={contextId}
            onEdit={handleStartEdit}
            onReply={() => onReply(message)}
            hidePinAction={hidePinAction}
            hideBookmarkAction={hideBookmarkAction}
          />
        ) : (
          <div ref={actionsRef} className="absolute -top-3 right-2 z-10 flex items-start">
            <div className="flex items-center gap-0.5 rounded bg-surface-dark shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <IconButton
                label="React"
                onClick={(e) => {
                  e.stopPropagation()
                  if (actionsRef.current) {
                    const rect = actionsRef.current.getBoundingClientRect()
                    setPickerAbove(rect.top > 460)
                  }
                  setEmojiOpen((p) => !p)
                }}
              >
                <SmileIcon />
              </IconButton>
              <IconButton
                label="Reply"
                onClick={(e) => {
                  e.stopPropagation()
                  onReply(message)
                }}
              >
                <ReplyIcon className="h-3 w-3 shrink-0" strokeWidth={2.5} />
              </IconButton>
              {dmShareUrl && (
                <IconButton label="Copy message link" onClick={copyDmMessageLink}>
                  <LinkIcon className="h-4 w-4" />
                </IconButton>
              )}
              {dmShareUrl && (
                <IconButton label="Share message" onClick={(e) => void shareDmMessage(e)}>
                  <ShareIcon />
                </IconButton>
              )}
              <IconButton
                label={message.pinned ? 'Unpin' : 'Pin'}
                onClick={(e) => {
                  e.stopPropagation()
                  const event = message.pinned ? 'dm:unpin' : 'dm:pin'
                  getSocket()?.emit(event, { messageId: message.id, conversationId: contextId })
                }}
              >
                <MessagePinIcon />
              </IconButton>
              {isAuthor && (
                <>
                  <IconButton
                    label="Edit"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartEdit()
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    ref={deleteBtnRef}
                    label="Delete"
                    variant="danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteConfirm(true)
                    }}
                  >
                    <TrashIcon />
                  </IconButton>
                </>
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
            {emojiOpen && (
              <div className={`absolute right-0 z-50 ${pickerAbove ? 'bottom-full mb-2' : 'top-full mt-2'}`}>
                <Suspense fallback={null}>
                  <EmojiPicker
                    onSelect={(emoji) => {
                      getSocket()?.emit('reaction:toggle', { messageId: message.id, emoji })
                      setEmojiOpen(false)
                    }}
                    onClose={() => setEmojiOpen(false)}
                  />
                </Suspense>
              </div>
            )}
          </div>
        ))}

      {showHead ? (
        isWebhook ? (
          <div className="shrink-0 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size="lg" />
          </div>
        ) : (
          <button type="button" onClick={handleAuthorClick} className="shrink-0 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size={isDm ? 'md' : 'lg'} />
          </button>
        )
      ) : (
        <div className={`flex ${isDm ? 'w-8' : 'w-10'} shrink-0 justify-center pt-1`}>
          {!isDm && (
            <span className="text-[10px] text-gray-500 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
              {formatTimeOnly(message.createdAt)}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1 pb-0.5">
        {message.replyTo && (
          <div className="mb-0.5 flex items-center gap-1.5 text-xs text-gray-400">
            <ReplyIcon className="h-3 w-3 shrink-0" strokeWidth={2.5} />
            <span className="font-medium text-gray-300">
              {message.replyTo.author?.displayName ?? message.replyTo.author?.username ?? 'Deleted User'}
            </span>
            <span className="truncate">{message.replyTo.content || '[attachment]'}</span>
          </div>
        )}

        {showHead && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
            {isWebhook ? (
              <span className="text-[15px] font-semibold" style={authorRoleColor ? { color: authorRoleColor } : usernameAccentStyle(name)}>
                {name}
              </span>
            ) : (
              <button
                type="button"
                onClick={handleAuthorClick}
                className="text-[15px] font-semibold hover:underline"
                style={authorRoleColor ? { color: authorRoleColor } : usernameAccentStyle(name)}
              >
                {name}
              </button>
            )}
            {(message.webhookId || message.author?.isBot) && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BOT</span>
            )}
            <time className="text-xs text-gray-500" dateTime={message.createdAt}>
              {formatSmartTimestamp(message.createdAt)}
            </time>
            {message.pinned && (
              <span className="rounded bg-yellow-600/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">
                PINNED
              </span>
            )}
            {message.editedAt && <span className="text-[10px] text-gray-500">(edited)</span>}
          </div>
        )}

        {editing ? (
          <div className="my-0.5">
            <textarea
              ref={textareaRef}
              className="w-full resize-none overflow-hidden rounded-md bg-surface-raised px-3 py-2 text-[15px] leading-relaxed text-gray-100 outline-none ring-1 ring-primary/50 focus:ring-primary"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSaveEdit()
                }
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            {isMobile ? (
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-300 transition active:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-text transition active:bg-primary/80"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="mt-1 flex gap-2 text-xs text-gray-400">
                <span>
                  escape to{' '}
                  <button type="button" className="text-link hover:underline" onClick={() => setEditing(false)}>
                    cancel
                  </button>
                </span>
                <span>•</span>
                <span>
                  enter to{' '}
                  <button type="button" className="text-link hover:underline" onClick={handleSaveEdit}>
                    save
                  </button>
                </span>
              </div>
            )}
          </div>
        ) : message.content && !contentIsMediaLink ? (
          <div>
            <MarkdownContent
              content={message.content}
              onMentionClick={onMentionClick}
              channels={channels}
              onChannelClick={onChannelClick}
              membersByUsername={membersByUsername}
              rolesByLowerName={rolesByLowerName}
              customEmojiMap={customEmojiMap}
            />
            {!showHead && message.editedAt ? <span className="ml-1.5 text-xs text-gray-500">(edited)</span> : null}
          </div>
        ) : null}

        {message.embeds && message.embeds.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {message.embeds.map((embed, i) => (
              <MessageEmbedCard key={i} embed={embed} />
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-col gap-1">
            {attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} />
            ))}
          </div>
        )}

        {linkPreviews.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {linkPreviews.map((lp) => (
              <LinkPreviewCard key={lp.id} lp={lp} />
            ))}
          </div>
        )}

        {message.poll && <PollDisplay poll={message.poll} />}

        {!isDm && !hideThreadAction && !message.threadParentId && (message.threadCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => {
              import('@/stores/thread.store').then(({ useThreadStore }) => {
                useThreadStore.getState().openThread(contextId, message)
              })
            }}
            className="mt-1.5 flex max-w-full items-center gap-1.5 overflow-hidden rounded-md bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/[0.06]"
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="shrink-0 font-medium text-primary/70">
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
            </span>
            {message.lastThreadReply && (
              <span className="min-w-0 truncate text-gray-400">
                <span className="font-medium text-gray-300">
                  {message.lastThreadReply.author?.displayName ?? message.lastThreadReply.author?.username ?? 'Someone'}:
                </span>
                {' '}{message.lastThreadReply.content?.slice(0, 80) || 'sent an attachment'}
              </span>
            )}
          </button>
        )}

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map((r) => {
              const isMine = userId ? r.userIds.includes(userId) : false
              return (
                <button
                  key={r.emoji}
                  type="button"
                  aria-pressed={isMine}
                  aria-label={`${r.emoji} ${r.count}`}
                  onClick={() => {
                    getSocket()?.emit('reaction:toggle', { messageId: message.id, emoji: r.emoji, isCustom: r.isCustom })
                  }}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
                    isMine
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                      : 'bg-surface-dark text-gray-300 ring-1 ring-white/10 hover:bg-surface-hover'
                  }`}
                >
                  <ReactionEmoji emoji={r.emoji} isCustom={r.isCustom} customEmojiMap={customEmojiMap} />
                  <span className="font-medium">{r.count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})


function ReactionEmoji({
  emoji,
  isCustom,
  customEmojiMap
}: {
  emoji: string
  isCustom: boolean
  customEmojiMap?: Map<string, CustomEmoji>
}) {
  const customEmoji = isCustom ? customEmojiMap?.get(emoji.toLowerCase()) : undefined

  if (isCustom && customEmoji) {
    return (
      <img
        src={resolveMediaUrl(customEmoji.imageUrl)}
        alt={`:${emoji}:`}
        title={`:${emoji}:`}
        className="h-4 w-4 object-contain"
        loading="lazy"
      />
    )
  }

  return <span>{emoji}</span>
}

function MobileEmojiPickerOverlay({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const serverId = useServerStore((s) => s.currentServerId)
  const customEmojis = useEmojiStore((s) => serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS)

  const handleReaction = useCallback(
    (emoji: string) => {
      getSocket()?.emit('reaction:toggle', { messageId, emoji })
      onClose()
    },
    [messageId, onClose]
  )

  const handleCustomReaction = useCallback(
    (name: string) => {
      getSocket()?.emit('reaction:toggle', { messageId, emoji: name, isCustom: true })
      onClose()
    },
    [messageId, onClose]
  )

  return (
    <Suspense fallback={null}>
      <EmojiPicker
        onSelect={handleReaction}
        onClose={onClose}
        customEmojis={customEmojis}
        reactionMode
        onCustomSelect={handleCustomReaction}
      />
    </Suspense>
  )
}
