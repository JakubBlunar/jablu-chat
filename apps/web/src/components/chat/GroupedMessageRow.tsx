import { lazy, Suspense, useEffect, useMemo, useState, type ComponentProps } from 'react'
import type { Message } from '@chat/shared'
import { useTranslation } from 'react-i18next'
import { MessageRow } from './MessageRow'
import { ReactionPill } from './ReactionPill'
import { ReactionDetailsModal } from './ReactionDetailsModal'
import { UserAvatar } from '@/components/UserAvatar'
import { useServerDisplayName } from '@/lib/serverProfile'
import { formatSmartTimestamp } from '@/lib/format-time'
import { aggregateReactions } from '@/lib/messageGrouping'
import { toggleGroupedReaction } from '@/lib/reactions'
import { api } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'
import { useEmojiStore, buildNameMap, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { showToast } from '@/stores/toast.store'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuthStore } from '@/stores/auth.store'

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
type RowProps = ComponentProps<typeof MessageRow>

function GroupAuthor({
  message,
  serverId,
  onUserClick
}: {
  message: Message
  serverId: string | null
  onUserClick: RowProps['onUserClick']
}) {
  const { t } = useTranslation('chat')
  const name = useServerDisplayName(message.author, serverId) ?? t('deletedUser')
  return (
    <button
      type="button"
      aria-label={name}
      className="inline-flex min-w-0 items-center gap-1.5 rounded font-semibold text-gray-100 hover:underline"
      onClick={(event) =>
        message.authorId && onUserClick?.(message.authorId, event.currentTarget.getBoundingClientRect())
      }
    >
      <UserAvatar username={name} avatarUrl={message.author?.avatarUrl} size="xs" />
      <span className="truncate">{name}</span>
    </button>
  )
}

/** Fetch bounded previews only when necessary to compute an exact union. */
function useGroupedReactions(messages: Message[], mode: RowProps['mode'], contextId: string) {
  const [loaded, setLoaded] = useState<{ source: Message[]; messages: Message[] } | null>(null)
  const partial = messages.some((m) => m.reactions?.some((r) => r.usersComplete === false))
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!partial) return
    let cancelled = false
    void Promise.all(
      messages.map(async (message) => ({
        ...message,
        reactions: await Promise.all(
          (message.reactions ?? []).map(async (reaction) => {
            if (reaction.usersComplete !== false) return reaction
            const users = new Set<string>()
            let cursor: string | null = null
            do {
              const query = new URLSearchParams({ emoji: reaction.emoji })
              if (cursor) query.set('after', cursor)
              const page = await api.get<{ userIds: string[]; nextCursor: string | null }>(
                `/api/${mode === 'channel' ? 'channels' : 'dm'}/${contextId}/messages/${message.id}/reactions?${query}`
              )
              page.userIds.forEach((id) => users.add(id))
              cursor = page.nextCursor
            } while (cursor && !cancelled)
            return { ...reaction, count: users.size, userIds: [...users], usersComplete: true }
          })
        )
      }))
    )
      .then((result) => {
        if (!cancelled) {
          setLoaded({ source: messages, messages: result })
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [messages, mode, contextId, partial, retry])
  const ready = !partial || loaded?.source === messages
  return {
    reactions: aggregateReactions(ready && loaded?.source === messages ? loaded.messages : messages),
    ready,
    failed,
    retry: () => {
      setFailed(false)
      setRetry((n) => n + 1)
    }
  }
}

export function GroupedMessageRow({
  messages,
  ...props
}: Omit<RowProps, 'message' | 'showHead'> & { messages: Message[] }) {
  const { t } = useTranslation('chat')
  const { t: common } = useTranslation('common')
  const [expanded, setExpanded] = useState(false)
  const [picker, setPicker] = useState(false)
  const [reactorsEmoji, setReactorsEmoji] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [showEveryone, setShowEveryone] = useState(false)
  const visibleAuthors = messages.length > 3 && !showEveryone ? messages.slice(0, 2) : messages
  const userId = useAuthStore((s) => s.user?.id)
  useEffect(() => {
    const edit = (event: Event) => {
      const id = (event as CustomEvent<string>).detail
      if (!expanded && messages.some((m) => m.id === id && m.authorId === userId)) {
        setExpanded(true)
        setEditId(id)
      }
    }
    window.addEventListener('edit-message-intent', edit)
    return () => window.removeEventListener('edit-message-intent', edit)
  }, [expanded, messages, userId])
  useEffect(() => {
    if (!editId || !expanded) return
    // Child effects have now registered the originals' edit listeners.
    window.dispatchEvent(new CustomEvent('edit-message-intent', { detail: editId }))
    setEditId(null)
  }, [editId, expanded])
  const serverId = useServerStore((s) => (props.mode === 'channel' ? s.currentServerId : null))
  const emojis = useEmojiStore((s) => (serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS))
  const customEmojiMap = useMemo(() => buildNameMap(emojis), [emojis])
  const { reactions, ready, failed, retry } = useGroupedReactions(messages, props.mode, props.contextId)
  const react = async (emoji: string, isCustom = false) => {
    if (await toggleGroupedReaction({ mode: props.mode, messages, emoji, isCustom })) setPicker(false)
  }
  return (
    <section
      data-message-group
      data-message-interactive={expanded || picker || reactorsEmoji ? 'true' : undefined}
      className="relative mt-4 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2"
    >
      <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span aria-hidden="true" className="text-primary">
          ✦
        </span>
        {visibleAuthors.map((message, index) => (
          <span key={message.id} className="inline-flex min-w-0 items-center gap-2">
            {index > 0 && visibleAuthors.length === messages.length && index === messages.length - 1 && (
              <span className="text-gray-400">{t('jinx.and')}</span>
            )}
            <GroupAuthor message={message} serverId={serverId} onUserClick={props.onUserClick} />
            {index < visibleAuthors.length - 1 &&
              !(visibleAuthors.length === messages.length && index === messages.length - 2) && (
                <span className="-ml-1 text-gray-400">,</span>
              )}
          </span>
        ))}
        {visibleAuthors.length < messages.length && (
          <button
            type="button"
            onClick={() => setShowEveryone(true)}
            aria-expanded="false"
            className="rounded font-semibold text-primary hover:underline"
          >
            {t('jinx.morePeople', { count: messages.length - visibleAuthors.length })}
          </button>
        )}
        <span className="text-gray-400">{t('jinx.say')}</span>
        <time className="text-[11px] text-gray-500" dateTime={messages[0].createdAt}>
          {formatSmartTimestamp(messages[0].createdAt)}
        </time>
      </header>
      <MessageRow {...props} message={messages[0]} showHead={false} omitDomId contentOnly />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {showEveryone && messages.length > 3 && (
          <button
            type="button"
            onClick={() => setShowEveryone(false)}
            aria-expanded="true"
            className="min-h-9 rounded px-2 text-xs text-gray-400 hover:underline"
          >
            {t('jinx.fewerPeople')}
          </button>
        )}
        {ready &&
          reactions.map((reaction) => (
            <ReactionPill
              key={`${reaction.isCustom}:${reaction.emoji}`}
              reaction={reaction}
              messageId={messages[0].id}
              mode={props.mode}
              contextId={props.contextId}
              customEmojiMap={customEmojiMap}
              onShowReactors={setReactorsEmoji}
              onToggle={() => void react(reaction.emoji, reaction.isCustom)}
            />
          ))}
        {!ready && (
          <span className="text-xs text-gray-400" role="status">
            {failed ? (
              <button type="button" onClick={retry}>
                {common('retry')}
              </button>
            ) : (
              t('jinx.loadingReactions')
            )}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPicker(!picker)}
          aria-label={t('jinx.reactTogether')}
          className="min-h-9 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10"
        >
          {t('jinx.reactTogether')}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="ml-auto min-h-9 rounded-md px-2 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-100"
        >
          {t(expanded ? 'jinx.hideOriginals' : 'jinx.showOriginals', { count: messages.length })}
        </button>
      </div>
      {picker && (
        <ErrorBoundary
          fallback={null}
          onError={() => {
            setPicker(false)
            showToast(t('emojiPicker'), t('emojiPickerFailed'))
          }}
        >
          <Suspense fallback={<span className="text-xs text-gray-400">{common('loading')}</span>}>
            <EmojiPicker
              reactionMode
              customEmojis={emojis}
              onSelect={(emoji) => void react(emoji)}
              onCustomSelect={(emoji) => void react(emoji, true)}
              onClose={() => setPicker(false)}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {ready && reactorsEmoji && (
        <ReactionDetailsModal
          reactions={reactions}
          initialEmoji={reactorsEmoji}
          mode={props.mode}
          contextId={props.contextId}
          customEmojiMap={customEmojiMap}
          onClose={() => setReactorsEmoji(null)}
        />
      )}
      {expanded && (
        <div className="mt-2 border-t border-primary/20 pt-1">
          {messages.map((message) => (
            <MessageRow {...props} key={message.id} message={message} showHead omitDomId />
          ))}
        </div>
      )}
    </section>
  )
}
