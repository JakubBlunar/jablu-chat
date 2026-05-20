import type { ReactionGroup } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveMediaUrl } from '@/lib/api'
import type { CustomEmoji } from '@/lib/api/types'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useIsMobile } from '@/hooks/useMobile'

const HOVER_DELAY_MS = 250
const LONG_PRESS_MS = 500
const TOOLTIP_NAME_LIMIT = 3

type Props = {
  reaction: ReactionGroup
  messageId: string
  mode: 'channel' | 'dm'
  contextId: string
  customEmojiMap?: Map<string, CustomEmoji>
  onShowReactors: (initialEmoji: string) => void
}

export function ReactionPill({
  reaction,
  messageId,
  mode,
  contextId,
  customEmojiMap,
  onShowReactors
}: Props) {
  const { t } = useTranslation('chat')
  const userId = useAuthStore((s) => s.user?.id)
  const isMobile = useIsMobile()
  const isMine = userId ? reaction.userIds.includes(userId) : false

  const [tooltipOpen, setTooltipOpen] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const resolveName = useReactorNameResolver(mode, contextId)

  const reactors = reaction.userIds
  const visible = reactors.slice(0, TOOLTIP_NAME_LIMIT)
  const remaining = Math.max(reactors.length - visible.length, 0)

  const cancelHover = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  useEffect(() => () => {
    cancelHover()
    cancelLongPress()
  }, [cancelHover, cancelLongPress])

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (isMobile) return
      if (e.pointerType === 'touch') return
      cancelHover()
      hoverTimer.current = setTimeout(() => setTooltipOpen(true), HOVER_DELAY_MS)
    },
    [isMobile, cancelHover]
  )

  const handlePointerLeave = useCallback(() => {
    if (isMobile) return
    cancelHover()
    setTooltipOpen(false)
  }, [isMobile, cancelHover])

  const handleFocus = useCallback(() => {
    if (isMobile) return
    setTooltipOpen(true)
  }, [isMobile])

  const handleBlur = useCallback(() => {
    if (isMobile) return
    setTooltipOpen(false)
  }, [isMobile])

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      longPressFired.current = false
      cancelLongPress()
      longPressTimer.current = setTimeout(() => {
        longPressFired.current = true
        onShowReactors(reaction.emoji)
      }, LONG_PRESS_MS)
    },
    [cancelLongPress, onShowReactors, reaction.emoji]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      cancelLongPress()
    },
    [cancelLongPress]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation()
      cancelLongPress()
    },
    [cancelLongPress]
  )

  const handleClick = useCallback(() => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    getSocket()?.emit('reaction:toggle', {
      messageId,
      emoji: reaction.emoji,
      isCustom: reaction.isCustom
    })
  }, [messageId, reaction.emoji, reaction.isCustom])

  const handleOthersClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setTooltipOpen(false)
      onShowReactors(reaction.emoji)
    },
    [onShowReactors, reaction.emoji]
  )

  return (
    <div
      className="relative inline-flex"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        aria-pressed={isMine}
        aria-label={`${reaction.emoji} ${reaction.count}`}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${
          isMine
            ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
            : 'bg-surface-dark text-gray-300 ring-1 ring-white/10 hover:bg-surface-hover'
        }`}
      >
        <ReactionEmoji emoji={reaction.emoji} isCustom={reaction.isCustom} customEmojiMap={customEmojiMap} />
        <span className="font-medium">{reaction.count}</span>
      </button>

      {tooltipOpen && !isMobile && reactors.length > 0 && (
        <div
          role="tooltip"
          className="pointer-events-auto absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-surface-dark px-3 py-2 text-xs text-gray-200 shadow-xl ring-1 ring-white/10"
        >
          <div className="flex items-center gap-1.5">
            <span className="shrink-0">
              <ReactionEmoji emoji={reaction.emoji} isCustom={reaction.isCustom} customEmojiMap={customEmojiMap} />
            </span>
            <span className="text-gray-400">{t('reactedBy')}</span>
            <span className="font-medium text-gray-100">
              {visible.map((id) => resolveName(id)).join(', ')}
            </span>
            {remaining > 0 && (
              <button
                type="button"
                onClick={handleOthersClick}
                className="ml-0.5 font-medium text-primary hover:underline"
              >
                {t('andOthers', { count: remaining })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ReactionEmoji({
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

/**
 * Resolve a userId to a short display label for the hover tooltip.
 * Looks at self -> member store (channel) -> dm conversation members,
 * with a graceful fallback for users who have left.
 */
function useReactorNameResolver(mode: 'channel' | 'dm', contextId: string): (userId: string) => string {
  const { t } = useTranslation('chat')
  const self = useAuthStore((s) => s.user)
  const members = useMemberStore((s) => s.members)
  const dmConversation = useDmStore((s) =>
    mode === 'dm' ? s.conversations.find((c) => c.id === contextId) : undefined
  )

  return useCallback(
    (userId: string) => {
      if (self && userId === self.id) {
        return self.displayName ?? self.username
      }
      if (mode === 'channel') {
        const m = members.find((mem) => mem.userId === userId)
        if (m) return m.user.displayName ?? m.user.username
      } else {
        const member = dmConversation?.members.find((mem) => mem.userId === userId)
        if (member) return member.displayName ?? member.username
      }
      return t('unknownUser')
    },
    [self, mode, members, dmConversation, t]
  )
}
