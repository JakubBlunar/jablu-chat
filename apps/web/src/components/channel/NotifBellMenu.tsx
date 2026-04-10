import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChannelNotifPrefTriggerIcon } from '@/components/channel/ChannelNotifPrefTriggerIcon'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/cn'
import { api } from '@/lib/api'
import { useNotifPrefStore } from '@/stores/notifPref.store'

type NotifLevel = 'all' | 'mentions' | 'none'

const LEVELS: { value: NotifLevel; label: string; desc: string }[] = [
  { value: 'all', label: 'All Messages', desc: 'Get notified for every message' },
  { value: 'mentions', label: 'Mentions Only', desc: 'Only @mentions' },
  { value: 'none', label: 'Muted', desc: 'No notifications' }
]

export function NotifBellMenu({ channelId, serverId }: { channelId: string; serverId?: string }) {
  const [open, setOpen] = useState(false)
  const storeLevel = useNotifPrefStore((s) => s.getEffective(channelId, serverId))
  const [optimistic, setOptimistic] = useState<NotifLevel | null>(null)
  const level = optimistic ?? storeLevel
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    setOptimistic(null)
  }, [channelId])

  useEffect(() => {
    if (!open) return
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuWidth = 208
      let left = rect.right - menuWidth
      if (left < 4) left = rect.left
      setMenuPos({ top: rect.bottom + 4, left })
    }
    const handler = (e: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const handleChange = useCallback(
    async (newLevel: NotifLevel) => {
      setOptimistic(newLevel)
      setOpen(false)
      try {
        if (newLevel === 'all') {
          await api.resetNotifPref(channelId)
          useNotifPrefStore.getState().remove(channelId)
        } else {
          await api.setNotifPref(channelId, newLevel)
          useNotifPrefStore.getState().set(channelId, newLevel)
        }
        setOptimistic(null)
      } catch {
        setOptimistic(null)
      }
    },
    [channelId]
  )

  const isMuted = level === 'none'
  const isMentions = level === 'mentions'

  return (
    <>
      <IconButton
        ref={btnRef}
        size="lg"
        label="Channel notification settings"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        className={cn(
          'relative h-10 w-10 shrink-0',
          isMuted && 'text-gray-500',
          isMentions && 'text-yellow-500'
        )}
      >
        <ChannelNotifPrefTriggerIcon level={level} />
      </IconButton>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-[300] w-52 rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10"
          >
            {LEVELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => void handleChange(opt.value)}
                className={`flex w-full flex-col px-3 py-2 text-left transition hover:bg-white/5 ${
                  level === opt.value ? 'text-white' : 'text-gray-300'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {level === opt.value && <CheckIcon />}
                  {opt.label}
                </span>
                <span className="text-[11px] text-gray-500">{opt.desc}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
