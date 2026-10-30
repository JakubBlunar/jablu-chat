import type { Channel, ForumPost } from '@chat/shared'
import { TagChip } from '@/components/ui/TagChip'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { useForumStore } from '@/stores/forum.store'
import { useChannelStore } from '@/stores/channel.store'
import { resolveMediaUrl } from '@/lib/api'
import { CreatePostModal } from './CreatePostModal'
import { ForumPostPanel } from './ForumPostPanel'
import { useServerDisplayName } from '@/lib/serverProfile'
import { useServerStore } from '@/stores/server.store'
import { openConversation } from '@/lib/conversationNavigation'

function ForumPostCard({ post, layout, onClick }: { post: ForumPost; layout: 'list' | 'grid'; onClick: () => void }) {
  const { t, i18n } = useTranslation('forum')
  const { t: tCommon } = useTranslation('common')
  const serverId = useServerStore((s) => s.currentServerId)
  const authorName = useServerDisplayName(post.author, serverId) ?? tCommon('unknown')
  const thumbnail = useMemo(() => {
    const att = (post.attachments as Array<{ type: string; url: string; thumbnailUrl?: string }>)?.find(
      (a) => a.type === 'image' || a.type === 'gif'
    )
    return att ? resolveMediaUrl(att.thumbnailUrl ?? att.url) : undefined
  }, [post.attachments])

  const timeAgo = useMemo(() => {
    const d = new Date(post.lastActivityAt)
    const diff = Date.now() - d.getTime()
    const mins = Math.floor(diff / 60000)
    const formatter = new Intl.RelativeTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      numeric: 'auto',
      style: 'short'
    })
    if (mins < 1) return formatter.format(0, 'second')
    if (mins < 60) return formatter.format(-mins, 'minute')
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return formatter.format(-hrs, 'hour')
    const days = Math.floor(hrs / 24)
    return formatter.format(-days, 'day')
  }, [post.lastActivityAt, i18n.language, i18n.resolvedLanguage])

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
              <TagChip key={t.id} name={t.name} color={t.color} />
            ))}
          </div>
        )}
        <h3 className="line-clamp-2 text-sm font-semibold text-white">{post.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-gray-400">
          {authorName}: {post.content}
        </p>
        <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-gray-500">
          {post.reactions.length > 0 && (
            <span>{t('counts.reactions', { count: post.reactions.reduce((sum, r) => sum + r.count, 0) })}</span>
          )}
          <span>{t('counts.replies', { count: post.replyCount })}</span>
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
              <TagChip key={t.id} name={t.name} color={t.color} />
            ))}
          </div>
        )}
        <h3 className="text-sm font-semibold text-white">{post.title}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">
          {authorName}: {post.content}
        </p>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-500">
          {post.reactions.length > 0 && (
            <span className="flex items-center gap-1">
              {post.reactions.slice(0, 3).map((r) => (
                <span key={r.emoji}>
                  {r.emoji} {r.count}
                </span>
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

export function ForumView({ channelId, onOpenNav }: { channelId: string; onOpenNav?: () => void }) {
  const { t } = useTranslation('nav')
  const { t: tForum } = useTranslation('forum')
  const { t: tA11y } = useTranslation('a11y')
  const channel = useChannelStore((s) => s.channels.find((c) => c.id === channelId)) as Channel | undefined

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
  const handleOpenPost = (postId: string) => {
    const serverId = channel?.serverId
    if (serverId) void openConversation({ target: { kind: 'channel', serverId, channelId }, position: { kind: 'message', messageId: postId }, source: 'link' })
  }
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
          {onOpenNav && (
            <button
              type="button"
              aria-label={tA11y('openNavigationMenu')}
              onClick={onOpenNav}
              className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          {!onOpenNav && (
            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 4h16a2 2 0 012 2v8a2 2 0 01-2 2h-5.17L10 19.17V16H4a2 2 0 01-2-2V6a2 2 0 012-2zm2 4h12v2H6V8zm0 3h8v2H6v-2z" />
            </svg>
          )}
          <h2 className="text-[15px] font-semibold text-white">{channel?.name ?? t('forumDefaultName')}</h2>
        </header>

        <SimpleBar className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto w-full max-w-4xl px-4 py-4">
            {/* Search + New Post */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder={t('searchPostsPlaceholder')}
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
                {tForum('create.newPost')}
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
                  {tForum('list.sortView')}
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sortDropdownOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-md bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-500">{tForum('list.sortBy')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('latest_activity')
                        setSortDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${sortOrder === 'latest_activity' ? 'text-primary' : 'text-gray-300'}`}
                    >
                      {tForum('list.latestActivity')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSortOrder('newest')
                        setSortDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${sortOrder === 'newest' ? 'text-primary' : 'text-gray-300'}`}
                    >
                      {tForum('list.newest')}
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-500">{tForum('list.view')}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('list')
                        setSortDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${layout === 'list' ? 'text-primary' : 'text-gray-300'}`}
                    >
                      {tForum('list.list')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('grid')
                        setSortDropdownOpen(false)
                      }}
                      className={`w-full px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${layout === 'grid' ? 'text-primary' : 'text-gray-300'}`}
                    >
                      {tForum('list.grid')}
                    </button>
                  </div>
                )}
              </div>

              {/* Tag chips */}
              {tags.length > 0 && (
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                  {tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      name={tag.name}
                      color={tag.color}
                      active={activeTagIds.includes(tag.id)}
                      onClick={() => toggleTag(tag.id)}
                    />
                  ))}
                  {tags.length > 8 && (
                    <button
                      type="button"
                      onClick={() => setTagPickerOpen((v) => !v)}
                      className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[11px] text-gray-400 hover:text-white"
                    >
                      {tForum('list.allTags')}
                      <svg
                        className="ml-0.5 inline h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
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
                      {tForum('list.clearAll')}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Post guidelines */}
            {channel?.postGuidelines && showGuidelines && (
              <div className="mt-3 rounded-lg border border-white/10 bg-surface-dark px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">{tForum('list.guidelines')}</span>
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
                <p className="text-sm text-gray-500">{tForum('list.loading')}</p>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="mt-8 flex flex-col items-center gap-2 text-center">
                <p className="text-sm text-gray-400">{tForum('list.empty')}</p>
                <p className="text-xs text-gray-600">{tForum('list.beFirst')}</p>
              </div>
            ) : layout === 'grid' ? (
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                {filteredPosts.map((post) => (
                  <ForumPostCard key={post.id} post={post} layout="grid" onClick={() => handleOpenPost(post.id)} />
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredPosts.map((post) => (
                  <ForumPostCard key={post.id} post={post} layout="list" onClick={() => handleOpenPost(post.id)} />
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
                  {tForum('list.loadMore')}
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
