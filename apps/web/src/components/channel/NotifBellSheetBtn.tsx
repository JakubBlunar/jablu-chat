import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import { useNotifPrefStore } from '@/stores/notifPref.store'

type NotifLevel = 'all' | 'mentions' | 'none'

const LEVELS: { value: NotifLevel; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All Messages', icon: <BellIcon /> },
  { value: 'mentions', label: 'Mentions Only', icon: <AtIcon /> },
  { value: 'none', label: 'Muted', icon: <BellMutedIcon /> }
]

export function NotifBellSheetBtn({ channelId, serverId, onClose }: { channelId: string; serverId?: string; onClose: () => void }) {
  const [subOpen, setSubOpen] = useState(false)
  const storeLevel = useNotifPrefStore((s) => s.getEffective(channelId, serverId))
  const [optimistic, setOptimistic] = useState<NotifLevel | null>(null)
  const level = optimistic ?? storeLevel

  const handleChange = useCallback(async (newLevel: NotifLevel) => {
    setOptimistic(newLevel)
    setSubOpen(false)
    onClose()
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
  }, [channelId, onClose])

  const currentLabel = LEVELS.find((l) => l.value === level)?.label ?? 'Notifications'

  return (
    <>
      <SheetBtn
        icon={level === 'none' ? <BellMutedIcon /> : <BellIcon />}
        label="Notifications"
        subtitle={currentLabel}
        onClick={() => setSubOpen(true)}
      />
      <BottomSheet open={subOpen} onClose={() => setSubOpen(false)} zIndex={110}>
        <div className="flex flex-col gap-1.5 px-3">
          {LEVELS.map((opt) => (
            <SheetBtn
              key={opt.value}
              icon={opt.icon}
              label={opt.label}
              subtitle={level === opt.value ? 'Current' : undefined}
              onClick={() => void handleChange(opt.value)}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  )
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function BellMutedIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function AtIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </svg>
  )
}
