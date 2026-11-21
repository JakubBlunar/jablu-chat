import type { Message, ReactionActivity } from '@chat/shared'
import { useEffect, useRef, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isAppFocused, subscribeAppVisibility } from '@/lib/appVisibility'
import { useNotificationCenterStore } from '@/stores/notificationCenter.store'

const REACTION_VIEW_MS = 900

function isVisible(element: HTMLElement, viewport: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const bounds = viewport.getBoundingClientRect()
  const left = Math.max(rect.left, bounds.left, 0)
  const right = Math.min(rect.right, bounds.right, window.innerWidth)
  const top = Math.max(rect.top, bounds.top, 0)
  const bottom = Math.min(rect.bottom, bounds.bottom, window.innerHeight)
  if (right <= left || bottom - top < Math.min(16, rect.height) || rect.height <= 0) return false
  // An open drawer or dialog can cover an intersecting message.
  return element.contains(document.elementFromPoint((left + right) / 2, (top + bottom) / 2))
}

export function reactionActivityKey({ emoji, isCustom }: Pick<ReactionActivity, 'emoji' | 'isCustom'>): string {
  return `${isCustom}:${emoji}`
}

export function useSeenReactionActivity(
  messages: Message[],
  viewportRef: RefObject<HTMLDivElement | null>,
  paused: boolean
) {
  const ref = useRef<HTMLDivElement>(null)
  const activity = useNotificationCenterStore(useShallow((s) =>
    messages.flatMap((message) => s.reactionsByMessage.get(message.id) ?? [])
  ))

  useEffect(() => {
    const row = ref.current
    const viewport = viewportRef.current
    if (paused || !activity.length || !row || !viewport || typeof IntersectionObserver === 'undefined') return

    let intersecting = false
    let disposed = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const attempted = new Set<string>()

    const schedule = () => {
      if (disposed) return
      if (!intersecting || !isAppFocused()) {
        clearTimeout(timeout)
        timeout = undefined
      } else if (timeout === undefined && attempted.size < activity.length) {
        timeout = setTimeout(check, REACTION_VIEW_MS)
      }
    }

    const check = () => {
      timeout = undefined
      if (disposed || !row.isConnected || !intersecting || !isAppFocused()) return
      const pills = new Map(
        [...row.querySelectorAll<HTMLElement>('[data-unseen-reaction]')]
          .map((pill) => [pill.dataset.unseenReaction, pill])
      )
      const seen = activity.filter((item) => {
        if (attempted.has(item.id)) return false
        // Removed reactions have no pill. Visiting their source message still clears the activity.
        return isVisible(pills.get(reactionActivityKey(item)) ?? row, viewport)
      })
      for (const item of seen) attempted.add(item.id)
      if (seen.length) void useNotificationCenterStore.getState().markReactionsSeen(seen)
      schedule()
    }

    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting
      if (!intersecting) attempted.clear()
      schedule()
    }, { root: viewport })
    observer.observe(row)
    const resume = () => {
      attempted.clear()
      schedule()
    }
    const unsubscribe = subscribeAppVisibility(resume)
    window.addEventListener('online', resume)
    return () => {
      disposed = true
      clearTimeout(timeout)
      unsubscribe()
      observer.disconnect()
      window.removeEventListener('online', resume)
    }
  }, [activity, paused, viewportRef])

  return { ref, unseenReactionKeys: activity.length ? new Set(activity.map(reactionActivityKey)) : undefined }
}
