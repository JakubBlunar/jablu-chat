import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/api'
import { useNotifPrefStore } from '@/stores/notifPref.store'

type NotifLevel = 'all' | 'mentions' | 'none'

const LEVELS: { value: NotifLevel; label: string; desc: string }[] = [
  { value: 'all', label: 'All Messages', desc: 'Get notified for every message' },
  { value: 'mentions', label: 'Mentions Only', desc: 'Only @mentions' },
  { value: 'none', label: 'Muted', desc: 'No notifications' }
]

export function NotifBellMenu({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState<NotifLevel>('all')
  const [loaded, setLoaded] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || loaded) return
    void api.getNotifPref(channelId).then((r) => {
      setLevel(r.level as NotifLevel)
      setLoaded(true)
    })
  }, [open, loaded, channelId])

  useEffect(() => {
    setLoaded(false)
    setLevel('all')
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
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleChange = useCallback(
    async (newLevel: NotifLevel) => {
      setLevel(newLevel)
      setOpen(false)
      if (newLevel === 'all') {
        await api.resetNotifPref(channelId)
        useNotifPrefStore.getState().remove(channelId)
      } else {
        await api.setNotifPref(channelId, newLevel)
        useNotifPrefStore.getState().set(channelId, newLevel)
      }
    },
    [channelId]
  )

  const isMuted = level === 'none'
  const isMentions = level === 'mentions'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Notification settings"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((p) => !p)
        }}
        className={`rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white ${
          isMuted ? 'text-gray-500' : isMentions ? 'text-yellow-500' : ''
        }`}
      >
        {isMuted ? <BellMutedIcon /> : <BellIcon />}
      </button>

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

function BellIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function BellMutedIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
