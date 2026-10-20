import type { Message } from '@chat/shared'
import { useTranslation } from 'react-i18next'
import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Spinner } from '@/components/ui'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { LinkPreviewCard, isImageUrl, isGifUrl } from '@/components/LinkPreviewCard'
import { MessageMediaProvider } from '@/components/media/MessageMediaGallery'
import { MarkdownContent, type ChannelRef } from '@/components/MarkdownContent'
import type { MemberMentionRef, RoleMentionRef } from '@/lib/markdownMentions'
import { ForwardedCard } from '@/components/chat/ForwardedCard'
import { MessageActions } from '@/components/chat/MessageActions'
import { MessageTranslationBlock } from '@/components/chat/MessageTranslationBlock'
import { MobileMessageDrawer } from '@/components/chat/MobileMessageDrawer'
import { MessageEmbedCard } from '@/components/chat/MessageEmbed'
import { PollDisplay } from '@/components/chat/PollDisplay'
import { ReactionPill } from '@/components/chat/ReactionPill'
import { ReactionDetailsModal } from '@/components/chat/ReactionDetailsModal'
import { useEmojiStore, buildNameMap, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { toggleMessageReactionAndRemember } from '@/lib/reactions'
import { UserAvatar } from '@/components/UserAvatar'
import { useIsMobile } from '@/hooks/useMobile'
import { formatSmartTimestamp, formatTimeOnly } from '@/lib/format-time'
import { editMessage } from '@/lib/messageActions'
import { messageActionError } from '@/lib/messageActionError'
import { usernameAccentStyle } from '@/lib/username-color'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'
import { DraftBadge } from '@/components/chat/DraftBadge'
import { useHasDraft } from '@/stores/draft.store'

const EmojiPicker = lazyWithRetry(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))

function ReactionPickerLoading() {
  return (
    <div className="flex h-24 w-[340px] max-w-[80vw] items-center justify-center rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10">
      <Spinner size="md" />
    </div>
  )
}

export const MessageRow = memo(function MessageRow({
  mode,
  message,
  showHead,
  contextId,
  onReply,
  onJumpToMessage,
  onUserClick,
  onMentionClick,
  channels,
  onChannelClick,
  membersByUsername,
  rolesByLowerName,
  authorRoleColor,
  replyAuthorRoleColor,
  hideThreadAction,
  hidePinAction,
  hideBookmarkAction
}: {
  mode: 'channel' | 'dm'
  message: Message
  showHead: boolean
  contextId: string
  onReply: (msg: Message) => void
  onJumpToMessage: (messageId: string) => void
  onUserClick?: (authorId: string, rect: DOMRect) => void
  onMentionClick?: (username: string, rect: DOMRect) => void
  channels?: ChannelRef[]
  onChannelClick?: (serverId: string, channelId: string) => void
  membersByUsername?: Map<string, MemberMentionRef>
  rolesByLowerName?: Map<string, RoleMentionRef>
  authorRoleColor?: string | null
  replyAuthorRoleColor?: string | null
  hideThreadAction?: boolean
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
}) {
  const { t } = useTranslation('chat')
  const userId = useAuthStore((s) => s.user?.id)
  const isDm = mode === 'dm'
  const threadDraft = useHasDraft(mode, contextId, message.id)
  const isWebhook = !isDm && !!message.webhook
  const isAuthor = message.authorId === userId
  const name = isWebhook
    ? message.webhook!.name
    : (message.author?.displayName ?? message.author?.username ?? t('deletedUser'))
  const avatarUrl = isWebhook ? message.webhook!.avatarUrl : (message.author?.avatarUrl ?? null)
  const attachments = message.attachments ?? []
  const reactions = message.reactions ?? []
  const replyTo = message.replyTo
  const replyAuthor = replyTo?.author
  const replyName = replyAuthor?.displayName ?? replyAuthor?.username ?? t('deletedUser')
  const linkPreviews = useMemo(() => message.linkPreviews ?? [], [message.linkPreviews])

  const contentIsMediaLink = useMemo(() => {
    const text = message.content?.trim()
    if (!text || linkPreviews.length !== 1) return false
    const lp = linkPreviews[0]
    if (text !== lp.url) return false
    return isImageUrl(lp) || isGifUrl(lp)
  }, [message.content, linkPreviews])

  const isMobile = useIsMobile()
  const serverId = useServerStore((s) => s.currentServerId)
  const emojiArr = useEmojiStore((s) => (serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS))
  const customEmojiMap = useMemo(() => (emojiArr.length > 0 ? buildNameMap(emojiArr) : undefined), [emojiArr])

  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(message.content ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const editPending = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileEmojiPicker, setMobileEmojiPicker] = useState(false)
  const [reactorsEmoji, setReactorsEmoji] = useState<string | null>(null)

  const handleStartEdit = useCallback(() => {
    if (editPending.current) return
    setEditValue(message.content ?? '')
    setEditError(null)
    setEditing(true)
  }, [message.content])

  useEffect(() => {
    if (!isAuthor) return
    const onIntent = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (id === message.id) handleStartEdit()
    }
    window.addEventListener('edit-message-intent', onIntent)
    return () => window.removeEventListener('edit-message-intent', onIntent)
  }, [isAuthor, message.id, handleStartEdit])

  const handleSaveEdit = useCallback(async () => {
    if (editPending.current) return
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === message.content) {
      setEditing(false)
      return
    }
    editPending.current = true
    setSavingEdit(true)
    setEditError(null)
    try {
      await editMessage(mode, contextId, message.id, trimmed)
      setEditing(false)
    } catch (error) {
      console.error('Could not edit message', error)
      setEditError(messageActionError(error))
    } finally {
      editPending.current = false
      setSavingEdit(false)
    }
  }, [editValue, message.id, message.content, mode, contextId])

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
      className={`group relative grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 rounded-md px-2 py-0.5 transition ${
        editing ? 'bg-white/[0.02]' : 'hover:bg-white/[0.03]'
      } ${showHead ? 'mt-4' : ''}`}
    >
      {drawerOpen && (
        <MobileMessageDrawer
          message={message}
          contextId={contextId}
          mode={mode}
          hidePinAction={hidePinAction}
          hideBookmarkAction={hideBookmarkAction}
          onClose={() => setDrawerOpen(false)}
          onEdit={isAuthor ? handleStartEdit : undefined}
          onReply={() => onReply(message)}
          onOpenEmojiPicker={() => setMobileEmojiPicker(true)}
        />
      )}
      {mobileEmojiPicker && (
        <MobileEmojiPickerOverlay messageId={message.id} mode={mode} onClose={() => setMobileEmojiPicker(false)} />
      )}
      {!editing && !isMobile && (
        <MessageActions
          message={message}
          mode={mode}
          contextId={contextId}
          onEdit={isAuthor ? handleStartEdit : undefined}
          onReply={() => onReply(message)}
          hidePinAction={hidePinAction}
          hideBookmarkAction={hideBookmarkAction}
        />
      )}

      {replyTo && (
        <div className="relative col-start-2 mb-1 flex min-w-0 items-center gap-1 whitespace-nowrap text-[13px] leading-5 text-gray-400">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-10 top-1/2 h-4 w-8 rounded-tl-md border-l-2 border-t-2 border-gray-500/60"
          />
          <UserAvatar username={replyName} avatarUrl={replyAuthor?.avatarUrl} size="xs" />
          {replyAuthor && onUserClick ? (
            <button
              type="button"
              title={`@${replyName}`}
              onClick={(event) => {
                event.stopPropagation()
                if (longPressFired.current) {
                  longPressFired.current = false
                  return
                }
                onUserClick(replyAuthor.id, event.currentTarget.getBoundingClientRect())
              }}
              className="max-w-[40%] shrink-0 truncate rounded font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={replyAuthorRoleColor ? { color: replyAuthorRoleColor } : usernameAccentStyle(replyName)}
            >
              @{replyName}
            </button>
          ) : (
            <span
              className="max-w-[40%] shrink-0 truncate font-medium"
              style={replyAuthorRoleColor ? { color: replyAuthorRoleColor } : usernameAccentStyle(replyName)}
            >
              {replyAuthor ? `@${replyName}` : replyName}
            </span>
          )}
          <button
            type="button"
            aria-label={t('jumpToMessage')}
            title={t('jumpToMessage')}
            onClick={(event) => {
              event.stopPropagation()
              if (longPressFired.current) {
                longPressFired.current = false
                return
              }
              onJumpToMessage(replyTo.id)
            }}
            className="min-w-0 flex-1 truncate rounded text-left transition-colors hover:text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {replyTo.content || '[attachment]'}
          </button>
        </div>
      )}

      {showHead ? (
        isWebhook ? (
          <div className="col-start-1 mt-0.5 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size="chat" />
          </div>
        ) : (
          <button type="button" onClick={handleAuthorClick} className="col-start-1 mt-0.5 self-start">
            <UserAvatar username={name} avatarUrl={avatarUrl} size="chat" />
          </button>
        )
      ) : (
        <div className="col-start-1 flex w-12 justify-center pt-1">
          {!isDm && (
            <span className="text-[10px] text-gray-500 opacity-100 md:opacity-0 md:transition md:group-hover:opacity-100">
              {formatTimeOnly(message.createdAt)}
            </span>
          )}
        </div>
      )}

      <div className="col-start-2 min-w-0">
        {showHead && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0 leading-5">
            {isWebhook ? (
              <span
                className="text-[15px] font-semibold"
                style={authorRoleColor ? { color: authorRoleColor } : usernameAccentStyle(name)}
              >
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
            {(isWebhook || message.webhookId || message.author?.isBot) && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">BOT</span>
            )}
            <time className="text-[11px] text-gray-500" dateTime={message.createdAt}>
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
              readOnly={savingEdit}
              aria-label={t('editMessageText')}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || savingEdit) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSaveEdit()
                }
                if (e.key === 'Escape') setEditing(false)
              }}
              autoFocus
            />
            {editError && (
              <p role="alert" className="mt-1 text-sm text-red-400">
                {editError}
              </p>
            )}
            {isMobile ? (
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={savingEdit}
                  className="rounded-md px-3 py-1.5 text-sm text-gray-300 transition active:bg-white/10"
                >
                  {t('editCancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={savingEdit}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-text transition active:bg-primary/80"
                >
                  {t(savingEdit ? 'messageActionPending' : 'editSave')}
                </button>
              </div>
            ) : (
              <div className="mt-1 flex gap-2 text-xs text-gray-400">
                <span>
                  {t('editCancelShortcut')}{' '}
                  <button
                    type="button"
                    disabled={savingEdit}
                    className="text-link hover:underline"
                    onClick={() => setEditing(false)}
                  >
                    {t('editCancel')}
                  </button>
                </span>
                <span>•</span>
                <span>
                  {t('editSaveShortcut')}{' '}
                  <button
                    type="button"
                    disabled={savingEdit}
                    className="text-link hover:underline"
                    onClick={() => void handleSaveEdit()}
                  >
                    {t(savingEdit ? 'messageActionPending' : 'editSave')}
                  </button>
                </span>
              </div>
            )}
          </div>
        ) : message.content && !contentIsMediaLink ? (
          <div>
            <MarkdownContent
              className="[&_p]:leading-normal"
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

        {message.content && <MessageTranslationBlock message={message} />}

        {message.forwardedFrom && <ForwardedCard snapshot={message.forwardedFrom} />}

        {message.embeds && message.embeds.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {message.embeds.map((embed, i) => (
              <MessageEmbedCard key={i} embed={embed} />
            ))}
          </div>
        )}

        <MessageMediaProvider attachments={attachments} linkPreviews={linkPreviews}>
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
        </MessageMediaProvider>

        {message.poll && <PollDisplay poll={message.poll} />}

        {!isDm && !hideThreadAction && !message.threadParentId && ((message.threadCount ?? 0) > 0 || threadDraft) && (
          <button
            type="button"
            onClick={() => {
              import('@/stores/thread.store').then(({ useThreadStore }) => {
                useThreadStore.getState().openThread(contextId, message)
              })
            }}
            className="mt-1.5 flex max-w-full items-center gap-1.5 overflow-hidden rounded-md bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/[0.06] max-lg:min-h-11"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-primary/70"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="shrink-0 font-medium text-primary/70">
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
            </span>
            <DraftBadge mode="channel" contextId={contextId} threadParentId={message.id} />
            {message.lastThreadReply && (
              <span className="min-w-0 truncate text-gray-400">
                <span className="font-medium text-gray-300">
                  {message.lastThreadReply.author?.displayName ?? message.lastThreadReply.author?.username ?? 'Someone'}
                  :
                </span>{' '}
                {message.lastThreadReply.content?.slice(0, 80) || 'sent an attachment'}
              </span>
            )}
          </button>
        )}

        {reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {reactions.map((r) => (
              <ReactionPill
                key={r.emoji}
                reaction={r}
                messageId={message.id}
                mode={mode}
                contextId={contextId}
                customEmojiMap={customEmojiMap}
                onShowReactors={setReactorsEmoji}
              />
            ))}
          </div>
        )}
        {reactorsEmoji && (
          <ReactionDetailsModal
            reactions={reactions}
            initialEmoji={reactorsEmoji}
            mode={mode}
            contextId={contextId}
            customEmojiMap={customEmojiMap}
            onClose={() => setReactorsEmoji(null)}
          />
        )}
      </div>
    </div>
  )
})

function MobileEmojiPickerOverlay({
  messageId,
  mode,
  onClose
}: {
  messageId: string
  mode: 'channel' | 'dm'
  onClose: () => void
}) {
  const serverId = useServerStore((s) => s.currentServerId)
  const customEmojis = useEmojiStore((s) => (serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS))

  const active = useRef(false)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  const handleReaction = useCallback(
    (emoji: string) => {
      void toggleMessageReactionAndRemember({ mode, messageId, emoji }).then((success) => {
        if (success && active.current) onClose()
      })
    },
    [mode, messageId, onClose]
  )

  const handleCustomReaction = useCallback(
    (name: string) => {
      void toggleMessageReactionAndRemember({ mode, messageId, emoji: name, isCustom: true }).then((success) => {
        if (success && active.current) onClose()
      })
    },
    [mode, messageId, onClose]
  )

  return (
    <ErrorBoundary
      fallback={null}
      onError={() => {
        onClose()
        showToast('Emoji picker', 'Failed to load. Please check your connection and try again.')
      }}
    >
      <Suspense fallback={<ReactionPickerLoading />}>
        <EmojiPicker
          onSelect={handleReaction}
          onClose={onClose}
          customEmojis={customEmojis}
          reactionMode
          onCustomSelect={handleCustomReaction}
        />
      </Suspense>
    </ErrorBoundary>
  )
}
