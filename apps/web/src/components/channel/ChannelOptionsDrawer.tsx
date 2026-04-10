import type { Channel } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChannelNotifPrefTriggerIcon } from '@/components/channel/ChannelNotifPrefTriggerIcon'
import { api } from '@/lib/api'
import { useNotifPrefStore } from '@/stores/notifPref.store'

type NotifLevel = 'all' | 'mentions' | 'none'

const LEVELS: { value: NotifLevel; label: string; icon: React.ReactNode }[] = [
  { value: 'all', label: 'All Messages', icon: <BellIcon /> },
  { value: 'mentions', label: 'Mentions Only', icon: <BellIcon /> },
  { value: 'none', label: 'Muted', icon: <BellMutedIcon /> }
]

interface ChannelOptionsDrawerProps {
  channel: Channel
  isAdminOrOwner: boolean
  onClose: () => void
  onEditChannel: () => void
  onOpenPinned: () => void
}

export function ChannelOptionsDrawer({
  channel,
  isAdminOrOwner,
  onClose,
  onEditChannel,
  onOpenPinned
}: ChannelOptionsDrawerProps) {
  const [visible, setVisible] = useState(false)
  const [notifLevel, setNotifLevel] = useState<NotifLevel>(() => {
    return (useNotifPrefStore.getState().prefs[channel.id] as NotifLevel) ?? 'all'
  })
  const [notifExpanded, setNotifExpanded] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true))
    })
  }, [])

  const close = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 200)
  }, [onClose])

  const handleNotifChange = useCallback(
    async (level: NotifLevel) => {
      const prev = notifLevel
      setNotifLevel(level)
      setNotifExpanded(false)
      try {
        if (level === 'all') {
          await api.resetNotifPref(channel.id)
          useNotifPrefStore.getState().remove(channel.id)
        } else {
          await api.setNotifPref(channel.id, level)
          useNotifPrefStore.getState().set(channel.id, level)
        }
      } catch {
        setNotifLevel(prev)
      }
    },
    [channel.id, notifLevel]
  )

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex flex-col justify-end bg-black/60 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault()
          close()
        }
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className={`w-full max-w-lg rounded-t-2xl bg-surface-dark pb-8 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div className="h-1 w-10 rounded-full bg-gray-600" />
        </div>

        {/* Channel name header */}
        <div className="flex items-center gap-2 px-4 pb-3">
          {channel.type === 'text' ? <HashIcon /> : <SpeakerIcon />}
          <span className="text-sm font-semibold text-white">{channel.name}</span>
        </div>

        <div className="border-t border-white/5" />

        {/* Actions */}
        <div className="flex flex-col gap-1 px-3 pt-3">
          {channel.type === 'text' && (
            <DrawerBtn
              icon={<PinIcon />}
              label="Pinned Messages"
              onClick={() => {
                close()
                onOpenPinned()
              }}
            />
          )}

          {/* Notification settings (text channels only) */}
          {channel.type === 'text' && (
            <>
              <DrawerBtn
                icon={<ChannelNotifPrefTriggerIcon level={notifLevel} />}
                label="Channel alerts"
                subtitle={LEVELS.find((l) => l.value === notifLevel)?.label}
                onClick={() => setNotifExpanded(!notifExpanded)}
              />
              {notifExpanded && (
                <div className="ml-8 space-y-0.5 pb-1">
                  {LEVELS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => void handleNotifChange(opt.value)}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                        notifLevel === opt.value
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-300 active:bg-white/5'
                      }`}
                    >
                      {opt.icon}
                      <span>{opt.label}</span>
                      {notifLevel === opt.value && (
                        <svg className="ml-auto h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {isAdminOrOwner && (
            <>
              <div className="my-1 border-t border-white/5" />
              <DrawerBtn
                icon={<GearIcon />}
                label="Edit Channel"
                onClick={() => {
                  close()
                  onEditChannel()
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function DrawerBtn({
  icon,
  label,
  subtitle,
  onClick
}: {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-gray-200 transition active:bg-white/5"
    >
      <span className="flex h-5 w-5 items-center justify-center text-gray-400">{icon}</span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
    </button>
  )
}

function HashIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11 4h2l1 4h4v2h-3.382l.894 4H19v2h-3.618l1 4h-2.054l-1-4H9.382l-1 4H6.328l1-4H4v-2h3.618L6.724 10H3V8h3.382L5.5 4h2.054l1 4h5.946l-1-4zM10.618 10l.894 4h5.946l-.894-4h-5.946z" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg className="h-5 w-5 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M15 4.5l-4 4L7 10l-1.5 1.5 7 7L14 17l1.5-3.96 4-4" />
      <line x1="9" y1="15" x2="4.5" y2="19.5" />
      <line x1="14.5" y1="4" x2="20" y2="9.5" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function BellMutedIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}
