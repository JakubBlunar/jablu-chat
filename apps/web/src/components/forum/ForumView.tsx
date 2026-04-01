import type { Channel, ForumPost } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { useForumStore } from '@/stores/forum.store'
import { useChannelStore } from '@/stores/channel.store'
import { useIsMobile } from '@/hooks/useMobile'
import { resolveMediaUrl } from '@/lib/api'
import { CreatePostModal } from './CreatePostModal'
import { ForumPostPanel } from './ForumPostPanel'

function ForumPostCard({
  post,
  layout,
  onClick
}: {
  post: ForumPost
  layout: 'list' | 'grid'
  onClick: () => void
}) {
  const thumbnail = useMemo(() => {
    const att = (post.attachments as Array<{ type: string; url: string; thumbnailUrl?: string }>)
      ?.find((a) => a.type === 'image' || a.type === 'gif')
    return att ? resolveMediaUrl(att.thumbnailUrl ?? att.url) : undefined
  }, [post.attachments])

  const timeAgo = useMemo(() => {
    const d = new Date(post.lastActivityAt)
    const now = Date.now()
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }, [post.lastActivityAt])

  if (layout === 'grid') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col rounded-lg border border-white/10 bg-surface-dark p-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
      >
        {thumbnail && (
          <img src={thumbnail} alt="" className="mb-2 h-32 w-full rounded-md object-cover" loading="lazy" />
        )}
        {post.tags.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {post.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: t.color ? `${t.color}30` : 'rgba(255,255,255,0.1)', color: t.color || '#9ca3af' }}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold text-white">{post.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-gray-400">
          {post.author?.displayName ?? post.author?.username ?? 'Unknown'}: {post.content}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-gray-500">
          {post.reactions.length > 0 && (
            <span>{post.reactions.reduce((sum, r) => sum + r.count, 0)} reactions</span>
          )}
          <span>{post.replyCount} replies</span>
          <span>{timeAgo}</span>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-white/10 bg-surface-dark p-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {post.tags.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {post.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: t.color ? `${t.color}30` : 'rgba(255,255,255,0.1)', color: t.color || '#9ca3af' }}
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
        <h3 className="text-sm font-semibold text-white">{post.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">
          {post.author?.displayName ?? post.author?.username ?? 'Unknown'}: {post.content}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
          {post.reactions.length > 0 && (
            <span className="flex items-center gap-1">
              {post.reactions.slice(0, 3).map((r) => (
                <span key={r.emoji}>{r.emoji} {r.count}</span>
              ))}
            </span>
          )}
          <span className="flex items-center gap-1">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {post.replyCount}
          </span>
          <span>{timeAgo}</span>
        </div>
      </div>
      {thumbnail && (
        <img src={thumbnail} alt="" className="h-16 w-20 shrink-0 rounded-md object-cover" loading="lazy" />
      )}
    </button>
  )
}

export function ForumView({
  channelId,
  onOpenNav
}: {
  channelId: string
  onOpenNav?: () => void
}) {
  const channel = useChannelStore((s) => s.channels.find((c) => c.id === channelId)) as Channel | undefined
  const isMobile = useIsMobile()

  const init = useForumStore((s) => s.init)
  const posts = useForumStore((s) => s.posts)
  const tags = useForumStore((s) => s.tags)
  const sortOrder = useForumStore((s) => s.sortOrder)
  const layout = useForumStore((s) => s.layout)
  const activeTagIds = useForumStore((s) => s.activeTagIds)
  const searchQuery = useForumStore((s) => s.searchQuery)
  const isLoading = useForumStore((s) => s.isLoading)
  const hasMore = useForumStore((s) => s.hasMore)
  const setSortOrder = useForumStore((s) => s.setSortOrder)
  const setLayout = useForumStore((s) => s.setLayout)
  const toggleTag = useForumStore((s) => s.toggleTag)
  const clearTagFilters = useForumStore((s) => s.clearTagFilters)
  const setSearchQuery = useForumStore((s) => s.setSearchQuery)
  const openPost = useForumStore((s) => s.openPost)
  const fetchMore = useForumStore((s) => s.fetchMore)

  const [createOpen, setCreateOpen] = useState(false)
  const [showGuidelines, setShowGuidelines] = useState(true)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const [_tagPickerOpen, setTagPickerOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    init(channelId, channel?.defaultLayout, channel?.defaultSortOrder)
  }, [channelId, channel?.defaultLayout, channel?.defaultSortOrder, init])

  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts
    const q = searchQuery.toLowerCase()
    return posts.filter(
      (p) =>
        p.title?.toLowerCase().includes(q) ||
        p.content?.toLowerCase().includes(q) ||
        p.author?.username.toLowerCase().includes(q)
    )
  }, [posts, searchQuery])

  const handleLoadMore = useCallback(() => {
    if (hasMore && !isLoading) fetchMore()
  }, [hasMore, isLoading, fetchMore])

  useEffect(() => {
    if (!sortDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [sortDropdownOpen])

  const currentPostId = useForumStore((s) => s.currentPostId)

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 bg-surface px-4 shadow-sm">
        {isMobile && onOpenNav && (
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={onOpenNav}
            className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        {!isMobile && (
          <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 4h16a2 2 0 012 2v8a2 2 0 01-2 2h-5.17L10 19.17V16H4a2 2 0 01-2-2V6a2 2 0 012-2zm2 4h12v2H6V8zm0 3h8v2H6v-2z" />
          </svg>
        )}
        <h2 className="text-[15px] font-semibold text-white">{channel?.name ?? 'Forum'}</h2>
      </header>

      <SimpleBar className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-4xl px-4 py-4">
          {/* Search + New Post */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search posts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border-0 bg-surface-darkest py-2 pl-9 pr-3 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-600 focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
              </svg>
              New Post
            </button>
          </div>

          {/* Sort & Tag Filter */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative" ref={sortRef}>
              <button
                type="button"
                onClick={() => setSortDropdownOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md bg-surface-darkest px-2.5 py-1.5 text-xs text-gray-300 transition hover:text-white"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                Sort & View
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {sortDropdownOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10">
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-500">Sort by</p>
                  <button
                    type="button"
                    onClick={() => { setSortOrder('latest_activity'); setSortDropdownOpen(false) }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${sortOrder === 'latest_activity' ? 'text-primary' : 'text-gray-300'}`}
                  >
                    Latest Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSortOrder('newest'); setSortDropdownOpen(false) }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${sortOrder === 'newest' ? 'text-primary' : 'text-gray-300'}`}
                  >
                    Newest
                  </button>
                  <div className="my-1 border-t border-white/10" />
                  <p className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-500">View</p>
                  <button
                    type="button"
                    onClick={() => { setLayout('list'); setSortDropdownOpen(false) }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${layout === 'list' ? 'text-primary' : 'text-gray-300'}`}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLayout('grid'); setSortDropdownOpen(false) }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${layout === 'grid' ? 'text-primary' : 'text-gray-300'}`}
                  >
                    Grid
                  </button>
                </div>
              )}
            </div>

            {/* Tag chips */}
            {tags.length > 0 && (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      activeTagIds.includes(tag.id)
                        ? 'border-transparent text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]'
                        : 'border-white/10 hover:border-white/20 hover:text-white'
                    }`}
                    style={
                      activeTagIds.includes(tag.id)
                        ? {
                            backgroundColor: tag.color || '#f59e0b'
                          }
                        : {
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            color: tag.color || '#9ca3af',
                            borderColor: tag.color ? `${tag.color}66` : undefined
                          }
                    }
                  >
                    {tag.name}
                  </button>
                ))}
                {tags.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setTagPickerOpen((v) => !v)}
                    className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-gray-400 hover:text-white"
                  >
                    All
                    <svg className="ml-0.5 inline h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
                {activeTagIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearTagFilters}
                    className="shrink-0 text-[11px] text-primary hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Post guidelines */}
          {channel?.postGuidelines && showGuidelines && (
            <div className="mt-3 rounded-lg border border-white/10 bg-surface-dark px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">Post Guidelines</span>
                <button
                  type="button"
                  onClick={() => setShowGuidelines(false)}
                  className="text-gray-500 hover:text-gray-300"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400 whitespace-pre-wrap">{channel.postGuidelines}</p>
            </div>
          )}

          {/* Post list */}
          {isLoading && filteredPosts.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              <p className="text-sm text-gray-500">Loading posts...</p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="mt-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm text-gray-400">No posts yet</p>
              <p className="text-xs text-gray-600">Be the first to create a post!</p>
            </div>
          ) : layout === 'grid' ? (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {filteredPosts.map((post) => (
                <ForumPostCard key={post.id} post={post} layout="grid" onClick={() => openPost(post.id)} />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {filteredPosts.map((post) => (
                <ForumPostCard key={post.id} post={post} layout="list" onClick={() => openPost(post.id)} />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && !isLoading && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="rounded-md bg-surface-darkest px-4 py-2 text-sm text-gray-400 transition hover:text-white"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </SimpleBar>

      </div>
      {currentPostId && <ForumPostPanel />}

      {createOpen && channel && (
        <CreatePostModal
          channelId={channelId}
          tags={tags}
          requireTags={channel.requireTags ?? false}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
