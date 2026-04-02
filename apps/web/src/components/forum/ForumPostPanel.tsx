import type { Message } from '@chat/shared'
import { TagChip } from '@/components/ui/TagChip'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ProfileCard } from '@/components/ProfileCard'
import { AttachmentPreview } from '@/components/AttachmentPreview'
import { MessageSurface } from '@/components/chat/MessageSurface'
import { useProfileCard } from '@/components/chat/hooks/useProfileCard'
import { useMessageScroll } from '@/components/chat/hooks/useMessageScroll'
import { UnifiedInput } from '@/components/chat/UnifiedInput'
import { UserAvatar } from '@/components/UserAvatar'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { formatSmartTimestamp } from '@/lib/format-time'
import { useIsMobile } from '@/hooks/useMobile'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { useForumSurfaceAdapter } from '@/hooks/useForumSurfaceAdapter'
import { getRoleColor, useMemberStore } from '@/stores/member.store'
import { useForumStore } from '@/stores/forum.store'
import { useForumReplyStore } from '@/stores/forumReply.store'
import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { api } from '@/lib/api'
import { usernameAccentStyle } from '@/lib/username-color'
import { IconButton, Spinner } from '@/components/ui'

export function ForumPostPanel({ gifEnabled, onCommand }: { gifEnabled?: boolean; onCommand?: (cmd: string, args?: string) => boolean | void }) {
  const currentPostId = useForumStore((s) => s.currentPostId)
  const posts = useForumStore((s) => s.posts)
  const channelId = useForumStore((s) => s.channelId)
  const closePost = useForumStore((s) => s.closePost)
  const updatePostInStore = useForumStore((s) => s.updatePost)
  const removePostFromStore = useForumStore((s) => s.removePost)

  const post = posts.find((p) => p.id === currentPostId) ?? null

  const userId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServerId)
  const { has: hasPerm } = usePermissions(serverId)
  const canManage = hasPerm(Permission.MANAGE_MESSAGES)
  const isAuthor = post?.authorId === userId

  const authorRoleColor = useMemberStore((s) => {
    if (!post?.authorId) return null
    const member = s.members.find((m) => m.userId === post.authorId)
    if (!member) return null
    return getRoleColor(member)
  })

  const adapter = useForumSurfaceAdapter(channelId)
  const scroll = useMessageScroll(currentPostId, adapter)

  const [replyTarget, setReplyTarget] = useState<{
    id: string
    content: string | null
    authorName: string
  } | null>(null)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const deleteBtnRef = useRef<HTMLButtonElement>(null)

  const { cardUser, cardRect, closeCard, handleUserClick } = useProfileCard(false, null)
  const scrollRef = useRef(scroll)
  scrollRef.current = scroll

  /* ── Pre-set loading state when a new post is selected ── */
  useEffect(() => {
    if (!currentPostId || !channelId) return
    setEditing(false)
    setMenuOpen(false)
    const replyState = useForumReplyStore.getState()
    if (replyState.loadedForPostId === currentPostId && replyState.channelId === channelId) return
    useForumReplyStore.setState({
      channelId,
      postId: currentPostId,
      isLoading: true,
      loadedForPostId: null
    })
    void useForumReplyStore.getState().fetchMessages()
  }, [currentPostId, channelId])

  /* ── Keep forum post list reply count in sync ── */
  const replyMessages = useForumReplyStore((s) => s.messages)
  useEffect(() => {
    if (currentPostId && replyMessages.length >= 0) {
      useForumStore.getState().updateReplyCount(currentPostId, replyMessages.length)
    }
  }, [currentPostId, replyMessages.length])

  /* ── Live event handlers ── */
  useEffect(() => {
    const handleNewMessage = (e: CustomEvent<Message>) => {
      if (e.detail.threadParentId !== currentPostId) return
      useForumReplyStore.getState().addMessage(e.detail)
      scrollRef.current.stickToBottom()
    }
    const onEdit = (e: CustomEvent<Message>) => {
      useForumReplyStore.getState().updateMessage(e.detail)
    }
    const onDelete = (e: CustomEvent<string>) => {
      useForumReplyStore.getState().removeMessage(e.detail)
    }
    const onPin = (e: CustomEvent<Message>) => {
      useForumReplyStore.getState().updateMessage(e.detail)
    }
    const onUnpin = (e: CustomEvent<Message>) => {
      useForumReplyStore.getState().updateMessage(e.detail)
    }
    const onReactionAdd = (e: CustomEvent<{ messageId: string; emoji: string; userId: string; isCustom?: boolean }>) => {
      const payload = e.detail
      const store = useForumReplyStore.getState()
      const msg = store.messages.find((m) => m.id === payload.messageId)
      if (!msg) return
      const reactions = [...(msg.reactions ?? [])]
      const idx = reactions.findIndex((r) => r.emoji === payload.emoji)
      if (idx >= 0) {
        const existing = reactions[idx]
        if (!existing.userIds.includes(payload.userId)) {
          reactions[idx] = { ...existing, count: existing.count + 1, userIds: [...existing.userIds, payload.userId] }
        }
      } else {
        reactions.push({ emoji: payload.emoji, count: 1, userIds: [payload.userId], isCustom: !!payload.isCustom })
      }
      store.updateMessage({ ...msg, reactions })
    }
    const onReactionRemove = (e: CustomEvent<{ messageId: string; emoji: string; userId: string }>) => {
      const payload = e.detail
      const store = useForumReplyStore.getState()
      const msg = store.messages.find((m) => m.id === payload.messageId)
      if (!msg) return
      const reactions = [...(msg.reactions ?? [])]
      const idx = reactions.findIndex((r) => r.emoji === payload.emoji)
      if (idx < 0) return
      const existing = reactions[idx]
      const nextUserIds = existing.userIds.filter((id) => id !== payload.userId)
      if (nextUserIds.length === 0) {
        reactions.splice(idx, 1)
      } else {
        reactions[idx] = { ...existing, count: nextUserIds.length, userIds: nextUserIds }
      }
      store.updateMessage({ ...msg, reactions })
    }

    window.addEventListener('forum-reply' as never, handleNewMessage)
    window.addEventListener('forum-reply:edit' as never, onEdit)
    window.addEventListener('forum-reply:delete' as never, onDelete)
    window.addEventListener('forum-reply:pin' as never, onPin)
    window.addEventListener('forum-reply:unpin' as never, onUnpin)
    window.addEventListener('forum-reply:reaction-add' as never, onReactionAdd)
    window.addEventListener('forum-reply:reaction-remove' as never, onReactionRemove)
    return () => {
      window.removeEventListener('forum-reply' as never, handleNewMessage)
      window.removeEventListener('forum-reply:edit' as never, onEdit)
      window.removeEventListener('forum-reply:delete' as never, onDelete)
      window.removeEventListener('forum-reply:pin' as never, onPin)
      window.removeEventListener('forum-reply:unpin' as never, onUnpin)
      window.removeEventListener('forum-reply:reaction-add' as never, onReactionAdd)
      window.removeEventListener('forum-reply:reaction-remove' as never, onReactionRemove)
    }
  }, [currentPostId])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const startEdit = useCallback(() => {
    if (!post) return
    setEditTitle(post.title ?? '')
    setEditContent(post.content ?? '')
    setEditing(true)
    setMenuOpen(false)
  }, [post])

  const cancelEdit = useCallback(() => {
    setEditing(false)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!post || !channelId || editSaving) return
    const trimmedTitle = editTitle.trim()
    if (!trimmedTitle) return
    setEditSaving(true)
    try {
      const updated = await api.patch(`/api/channels/${channelId}/posts/${post.id}`, {
        title: trimmedTitle,
        content: editContent.trim()
      })
      updatePostInStore(updated as never)
      setEditing(false)
    } catch { /* ignore */ }
    setEditSaving(false)
  }, [post, channelId, editTitle, editContent, editSaving, updatePostInStore])

  const handleDelete = useCallback(async () => {
    if (!post || !channelId) return
    try {
      await api.delete(`/api/channels/${channelId}/posts/${post.id}`)
      removePostFromStore(post.id)
      closePost()
    } catch { /* ignore */ }
    setShowDeleteConfirm(false)
  }, [post, channelId, removePostFromStore, closePost])

  const handleToggleLock = useCallback(async () => {
    if (!post || !channelId) return
    setMenuOpen(false)
    try {
      const endpoint = `/api/channels/${channelId}/posts/${post.id}/lock`
      const updated = post.isLocked
        ? await api.delete(endpoint)
        : await api.post(endpoint, {})
      updatePostInStore(updated as never)
    } catch { /* ignore */ }
  }, [post, channelId, updatePostInStore])

  const handleReply = useCallback((msg: Message) => {
    setReplyTarget({
      id: msg.id,
      content: msg.content,
      authorName: msg.author?.displayName ?? msg.author?.username ?? 'Unknown'
    })
  }, [])

  const isMobile = useIsMobile()

  if (!currentPostId || !post || !channelId) return null

  const authorName = post.author?.displayName ?? post.author?.username ?? 'Deleted User'
  const showActions = isAuthor || canManage

  /* ── Root post + reply count rendered at visual top via headerContent ── */
  const headerContent = (
    <>
      {/* Reply count divider (appears below root post, above messages) */}
      <div className="px-2 py-1 text-[11px] font-semibold text-gray-500">
        {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
      </div>

      {/* Root post body (appears at the very top of the scroll area) */}
      <div className="border-b border-white/10 p-4">
        {post.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {post.tags.map((t) => (
              <TagChip key={t.id} name={t.name} color={t.color} />
            ))}
          </div>
        )}

        {editing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-md border-0 bg-surface-darkest px-3 py-2 text-sm font-semibold text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
              autoFocus
            />
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              maxLength={4000}
              rows={4}
              className="w-full resize-none rounded-md border-0 bg-surface-darkest px-3 py-2 text-sm text-gray-300 outline-none ring-1 ring-white/10 transition placeholder:text-gray-600 focus:ring-2 focus:ring-primary"
              placeholder="Post content..."
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEdit}
                className="rounded-md px-3 py-1.5 text-xs text-gray-400 transition hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                if (!post.authorId) return
                handleUserClick(post.authorId, (e.currentTarget as HTMLElement).getBoundingClientRect())
              }}
              className="shrink-0"
            >
              <UserAvatar username={authorName} avatarUrl={post.author?.avatarUrl ?? null} size="md" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    if (!post.authorId) return
                    handleUserClick(post.authorId, (e.currentTarget as HTMLElement).getBoundingClientRect())
                  }}
                  className="text-left text-sm font-semibold hover:underline"
                  style={authorRoleColor ? { color: authorRoleColor } : usernameAccentStyle(authorName)}
                >
                  {authorName}
                </button>
                <time className="text-[11px] text-gray-500">{formatSmartTimestamp(post.createdAt)}</time>
                {post.editedAt && (
                  <span className="text-[10px] text-gray-600">(edited)</span>
                )}
              </div>
              {post.content && (
                <div className="mt-0.5 text-sm text-gray-300">
                  <MarkdownContent content={post.content} />
                </div>
              )}
              {(post.attachments?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {post.attachments.map((att) => (
                    <AttachmentPreview key={(att as { id: string }).id} attachment={att as any} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {post.isLocked && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-yellow-500/10 px-2.5 py-1.5 text-xs text-yellow-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            This post is locked
          </div>
        )}
      </div>
    </>
  )

  const emptyState =
    adapter.isLoading && adapter.messages.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    ) : !adapter.isLoading && adapter.messages.length === 0 ? (
      <p className="py-8 text-center text-xs text-gray-500">No replies yet. Be the first!</p>
    ) : undefined

  return (
    <div className={`flex min-h-0 shrink-0 flex-col border-l border-white/10 bg-surface-dark ${isMobile ? 'absolute inset-0 z-20 w-full border-l-0' : 'w-80'}`}>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{post.title}</h3>
        <div className="flex items-center gap-1">
          {showActions && (
            <div className="relative" ref={menuRef}>
              <IconButton label="Post actions" variant="ghost" size="md" onClick={() => setMenuOpen((v) => !v)}>
                <svg className="h-4 w-4 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </IconButton>
              {menuOpen && (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-md bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10">
                  {(isAuthor || canManage) && (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Post
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={handleToggleLock}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        {post.isLocked
                          ? <path d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                          : <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        }
                      </svg>
                      {post.isLocked ? 'Unlock Post' : 'Lock Post'}
                    </button>
                  )}
                  {(isAuthor || canManage) && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      <button
                        ref={deleteBtnRef}
                        type="button"
                        onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true) }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-red-400 transition hover:bg-red-500/10 hover:text-red-300"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete Post
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <IconButton label="Close post" variant="ghost" size="md" onClick={closePost}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </IconButton>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete Post"
          description="This will permanently delete this post and all its replies. This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      <MessageSurface
        key={currentPostId}
        scroll={scroll}
        messages={adapter.messages}
        isLoading={adapter.isLoading}
        hasMore={adapter.hasMore}
        hasNewer={adapter.hasNewer}
        mode="channel"
        contextId={channelId}
        headerContent={headerContent}
        emptyState={emptyState}
        onReply={handleReply}
        onUserClick={handleUserClick}
        hideThreadAction
        hidePinAction
        hideBookmarkAction
      />

      {!post.isLocked && (
        <UnifiedInput
          mode="channel"
          contextId={channelId}
          threadParentId={currentPostId}
          replyTarget={replyTarget}
          onCancelReply={() => setReplyTarget(null)}
          onSent={() => {
            void useForumReplyStore.getState().reconcileToLatest().then(() => scroll.stickToBottom())
          }}
          gifEnabled={gifEnabled}
          onCommand={onCommand}
          placeholder="Reply to post..."
        />
      )}
      {cardUser && <ProfileCard user={cardUser} onClose={closeCard} anchorRect={cardRect} />}
    </div>
  )
}
