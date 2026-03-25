import type { Channel, UserStatus } from '@chat/shared'
import { RoomEvent, type Participant } from 'livekit-client'
import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import SimpleBar from 'simplebar-react'
const CreateChannelModal = React.lazy(() =>
  import('@/components/channel/CreateChannelModal').then((m) => ({ default: m.CreateChannelModal }))
)
const EditChannelModal = React.lazy(() =>
  import('@/components/channel/EditChannelModal').then((m) => ({ default: m.EditChannelModal }))
)
const InviteModal = React.lazy(() =>
  import('@/components/server/InviteModal').then((m) => ({ default: m.InviteModal }))
)
const ServerSettingsModal = React.lazy(() =>
  import('@/components/server/ServerSettingsModal').then((m) => ({ default: m.ServerSettingsModal }))
)
import { UserAvatar } from '@/components/UserAvatar'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useSortedChannels } from '@/hooks/useSortedChannels'

const ReorderChannelsModal = React.lazy(() =>
  import('@/components/server/ReorderChannelsModal').then((m) => ({ default: m.ReorderChannelsModal }))
)

import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useLayoutStore } from '@/stores/layout.store'
import { type Member, useMemberStore } from '@/stores/member.store'
import { useServerStore } from '@/stores/server.store'
import { type VoiceParticipant, useVoiceStore } from '@/stores/voice.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore } from '@/stores/notifPref.store'
import { DownloadAppBanner } from '@/components/settings/DownloadApp'
import { VoicePanel } from '@/components/voice/VoicePanel'
import { ProfileCard, type ProfileCardUser } from '@/components/ProfileCard'
import { useEventStore } from '@/stores/event.store'

const EventsPanel = React.lazy(() =>
  import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel }))
)

function VoiceStatusIcons({ participant }: { participant: VoiceParticipant }) {
  const icons: React.ReactNode[] = []

  if (participant.muted) {
    icons.push(
      <svg key="muted" className="h-3.5 w-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-label="Muted">
        <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
      </svg>
    )
  }

  if (participant.deafened) {
    icons.push(
      <svg
        key="deafened"
        className="h-3.5 w-3.5 text-red-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Deafened"
      >
        <path d="M3.63 3.63a.996.996 0 000 1.41L7.29 8.7 7 9H4c-.55 0-1 .45-1 1v4c0 .55.45 1 1 1h3l3.29 3.29c.63.63 1.71.18 1.71-.71v-4.17l4.18 4.18c-.49.37-1.02.68-1.59.91-.36.15-.58.53-.58.92 0 .72.73 1.18 1.39.91.8-.33 1.55-.77 2.22-1.31l1.34 1.34a.996.996 0 101.41-1.41L5.05 3.63c-.39-.39-1.02-.39-1.42 0zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-3.83-2.4-7.11-5.78-8.4-.59-.23-1.22.23-1.22.86v.19c0 .45.3.87.74 1C17.01 6.54 19 9.06 19 12zm-7-8l-1.88 1.88L12 7.76zm4.5 8A4.5 4.5 0 0014 7.97v1.79l2.48 2.48c.01-.08.02-.16.02-.24z" />
      </svg>
    )
  }

  if (participant.camera) {
    icons.push(
      <svg
        key="camera"
        className="h-3.5 w-3.5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Camera on"
      >
        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
    )
  }

  if (participant.screenShare) {
    icons.push(
      <svg
        key="screen"
        className="h-3.5 w-3.5 text-emerald-400"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-label="Sharing screen"
      >
        <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
      </svg>
    )
  }

  if (icons.length === 0) return null

  return <span className="flex shrink-0 items-center gap-0.5">{icons}</span>
}

function useSpeakingUsers() {
  const room = useVoiceConnectionStore((s) => s.room)
  const [speaking, setSpeaking] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!room) {
      setSpeaking(new Set())
      return
    }
    const onSpeakers = (speakers: Participant[]) => {
      setSpeaking(new Set(speakers.map((s) => s.identity)))
    }
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers)
    }
  }, [room])

  return speaking
}

function VoiceParticipantRow({
  participant,
  member,
  isSpeaking,
  onClick
}: {
  participant: VoiceParticipant
  member?: Member
  isSpeaking: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <li
      className="group/vp flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition hover:bg-white/[.07]"
      onClick={onClick}
    >
      <div className="relative shrink-0">
        <UserAvatar
          username={participant.username}
          avatarUrl={member?.user.avatarUrl}
          size="sm"
        />
        {isSpeaking && (
          <div className="absolute -inset-[3px] rounded-full ring-2 ring-emerald-500/80" />
        )}
      </div>
      <span
        className={`min-w-0 flex-1 truncate text-[13px] font-medium transition-colors ${
          isSpeaking ? 'text-emerald-400' : 'text-gray-300 group-hover/vp:text-gray-100'
        }`}
      >
        {member?.user.displayName || participant.username}
      </span>
      <VoiceStatusIcons participant={participant} />
    </li>
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

function PlusSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 11h-6V5h-2v6H5v2h6v6h2v-6h6v-2z" />
    </svg>
  )
}

function InviteIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  )
}

function LeaveIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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

function ReorderIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z" />
    </svg>
  )
}

function GearSmallIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}

export function ChannelSidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const user = useAuthStore((s) => s.user)

  const currentServer = useServerStore((s) => {
    const id = s.currentServerId
    if (!id) return null
    return s.servers.find((x) => x.id === id) ?? null
  })
  const { orchestratedGoToChannel } = useAppNavigate()
  const channelsLoading = useChannelStore((s) => s.isLoading)
  const channels = useChannelStore((s) => s.channels)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)

  const { textChannels, voiceChannels } = useSortedChannels(channels)

  const myMembership = useMemberStore((s) => s.members.find((m) => m.userId === user?.id))
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin'

  const isOwner = currentServer?.ownerId === user?.id
  const removeServer = useServerStore((s) => s.removeServer)
  const voiceParticipants = useVoiceStore((s) => s.participants)
  const currentVoiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom)
  const speakingUsers = useSpeakingUsers()

  const channelReadStates = useReadStateStore((s) => s.channels)
  const ackChannel = useReadStateStore((s) => s.ackChannel)
  const notifPrefs = useNotifPrefStore((s) => s.prefs)
  const getNotifLevel = useCallback((channelId: string) => notifPrefs[channelId] ?? 'all', [notifPrefs])

  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [voiceCardUser, setVoiceCardUser] = useState<ProfileCardUser | null>(null)
  const [voiceCardRect, setVoiceCardRect] = useState<DOMRect | null>(null)
  const [eventsOpen, setEventsOpen] = useState(false)

  const eventCount = useEventStore((s) =>
    currentServer && s.loadedServerId === currentServer.id ? s.events.length : 0
  )
  const fetchEvents = useEventStore((s) => s.fetchEvents)

  useEffect(() => {
    if (currentServer) fetchEvents(currentServer.id)
  }, [currentServer?.id, fetchEvents])

  const members = useMemberStore((s) => s.members)

  const handleVoiceParticipantClick = useCallback(
    (p: VoiceParticipant, e: React.MouseEvent) => {
      if (p.userId === user?.id) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const member = members.find((m) => m.userId === p.userId)
      setVoiceCardUser({
        id: p.userId,
        username: p.username,
        displayName: member?.user.displayName,
        avatarUrl: member?.user.avatarUrl,
        bio: member?.user.bio ?? null,
        status: (member?.user.status ?? 'online') as UserStatus,
        joinedAt: member?.joinedAt,
        role: member?.role
      })
      setVoiceCardRect(rect)
    },
    [user?.id, members]
  )

  useEffect(() => {
    if (currentChannelId && !viewingVoiceRoom) {
      ackChannel(currentChannelId)
    }
  }, [currentChannelId, viewingVoiceRoom, ackChannel])

  const handleVoiceChannelClick = useCallback(
    (ch: Channel) => {
      const store = useVoiceConnectionStore.getState()
      if (store.currentChannelId === ch.id) {
        store.setViewingVoiceRoom(true)
        return
      }
      if (!currentServer) return
      import('@/lib/voiceConnect').then(({ joinVoiceChannel }) => joinVoiceChannel(currentServer.id, ch.id, ch.name))
    },
    [currentServer]
  )

  const [leaveError, setLeaveError] = useState<string | null>(null)
  const handleLeave = useCallback(async () => {
    if (!currentServer) return
    if (!confirm(`Leave ${currentServer.name}? You will need a new invite to rejoin.`)) return
    setLeaveError(null)
    try {
      await api.leaveServer(currentServer.id)
      removeServer(currentServer.id)
    } catch {
      setLeaveError('Failed to leave server')
    }
  }, [currentServer, removeServer])

  const sidebarWidth = useLayoutStore((s) => s.channelSidebarWidth)
  const setSidebarWidth = useLayoutStore((s) => s.setChannelSidebarWidth)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
    }
  }, [menuOpen])

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = useLayoutStore.getState().channelSidebarWidth

      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX
        setSidebarWidth(startW + delta)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setSidebarWidth]
  )

  return (
    <>
      <aside className="relative flex h-full shrink-0 flex-col bg-surface-dark" style={{ width: sidebarWidth }}>
        {/* Drag handle */}
        <div
          className="absolute right-0 top-0 z-30 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40"
          onMouseDown={handleDragStart}
        />

        {/* Server name header with dropdown */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => currentServer && setMenuOpen((v) => !v)}
            className="flex h-12 w-full shrink-0 items-center justify-between border-b border-black/20 px-3 shadow-sm transition hover:bg-white/[0.04]"
          >
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-white">
              {currentServer?.name ?? 'Select a server'}
            </span>
            {currentServer && (
              <svg
                className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>

          {menuOpen && currentServer && (
            <div className="absolute left-2 right-2 top-12 z-40 overflow-hidden rounded-md bg-surface-darkest py-1.5 shadow-xl ring-1 ring-white/10">
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setServerSettingsOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-white"
                >
                  <GearIcon />
                  Server Settings
                </button>
              )}
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setReorderOpen(true)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-white"
                >
                  <ReorderIcon />
                  Reorder Channels
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setInviteOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-white"
              >
                <InviteIcon />
                Invite People
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setEventsOpen(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 transition hover:bg-primary hover:text-white"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Events
                {eventCount > 0 && (
                  <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {eventCount}
                  </span>
                )}
              </button>
              {!isOwner && (
                <>
                  <div className="my-1 border-t border-white/10" />
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      void handleLeave()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/20"
                  >
                    <LeaveIcon />
                    Leave Server
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {leaveError && (
          <div className="mx-2 mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400">{leaveError}</div>
        )}

        <SimpleBar className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-3">
          {channelsLoading && !textChannels.length && currentServer ? (
            <div className="space-y-2 px-1">
              <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
              <div className="h-8 w-full animate-pulse rounded bg-white/5" />
            </div>
          ) : null}

          {currentServer && eventCount > 0 && (
            <button
              type="button"
              onClick={() => setEventsOpen(true)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
            >
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Events
              <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {eventCount}
              </span>
            </button>
          )}

          <div className="group/header flex items-center justify-between px-2 pt-1">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400">TEXT CHANNELS</span>
            {isAdminOrOwner && (
              <button
                type="button"
                title="Create channel"
                aria-label="Create text channel"
                disabled={!currentServer}
                onClick={() => setChannelModalOpen(true)}
                className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
              >
                <PlusSmallIcon />
              </button>
            )}
          </div>

          <ul className="space-y-0.5">
            {textChannels.map((ch) => {
              const active = ch.id === currentChannelId && !viewingVoiceRoom
              const rs = channelReadStates.get(ch.id)
              const level = getNotifLevel(ch.id)
              const showUnreadDot = level === 'all' && !active && rs != null && rs.unreadCount > 0
              const showMentions = level !== 'none' && !active && (rs?.mentionCount ?? 0) > 0
              const mentionCount = showMentions ? rs!.mentionCount : 0
              const hasIndicator = showUnreadDot || showMentions
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentServer) void orchestratedGoToChannel(currentServer.id, ch.id)
                      useVoiceConnectionStore.getState().setViewingVoiceRoom(false)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[15px] transition ${
                      active
                        ? 'bg-surface-selected text-white'
                        : hasIndicator
                          ? 'font-semibold text-white hover:bg-white/[0.06]'
                          : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <HashIcon />
                    <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                    {mentionCount > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {mentionCount > 10 ? '10+' : mentionCount}
                      </span>
                    )}
                    {showUnreadDot && mentionCount === 0 && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="group/header mt-3 flex items-center justify-between px-2 pt-1">
            <span className="text-[11px] font-semibold tracking-wide text-gray-400">VOICE CHANNELS</span>
            {isAdminOrOwner && (
              <button
                type="button"
                title="Create channel"
                aria-label="Create voice channel"
                disabled={!currentServer}
                onClick={() => setChannelModalOpen(true)}
                className="rounded p-0.5 text-gray-400 opacity-0 transition hover:bg-white/10 hover:text-white group-hover/header:opacity-100 focus-visible:opacity-100 disabled:opacity-0"
              >
                <PlusSmallIcon />
              </button>
            )}
          </div>

          <ul className="space-y-1">
            {voiceChannels.map((ch) => {
              const participants = voiceParticipants[ch.id] ?? []
              const inThisChannel = currentVoiceChannelId === ch.id && viewingVoiceRoom
              return (
                <li key={ch.id}>
                  <div className="group/ch relative rounded-md px-2 py-1.5 text-[15px] text-gray-300">
                    <button
                      type="button"
                      onClick={() => handleVoiceChannelClick(ch)}
                      className={`flex w-full cursor-pointer items-center gap-2 text-left ${inThisChannel ? 'text-white' : ''}`}
                    >
                      <SpeakerIcon />
                      <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                      {participants.length > 0 && (
                        <span className="shrink-0 text-xs text-gray-400">{participants.length}</span>
                      )}
                    </button>
                    {participants.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {participants.map((p) => {
                          const member = members.find((m) => m.userId === p.userId)
                          return (
                            <VoiceParticipantRow
                              key={p.userId}
                              participant={p}
                              member={member}
                              isSpeaking={speakingUsers.has(p.userId)}
                              onClick={(e) => handleVoiceParticipantClick(p, e)}
                            />
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500">No one connected</p>
                    )}
                    {isAdminOrOwner && (
                      <button
                        type="button"
                        title="Edit channel"
                        onClick={() => setEditingChannel(ch)}
                        className="absolute right-1 top-2 rounded p-0.5 text-gray-400 opacity-0 transition hover:text-white group-hover/ch:opacity-100"
                      >
                        <GearSmallIcon />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </SimpleBar>

        <VoicePanel />
        <DownloadAppBanner />

        <div className="flex h-[52px] shrink-0 items-center gap-2 bg-surface-overlay px-2">
          <UserAvatar
            username={user?.username ?? 'User'}
            avatarUrl={user?.avatarUrl}
            size="md"
            showStatus
            status={user?.status ?? 'online'}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.displayName ?? user?.username ?? '…'}</p>
            <p className="truncate text-xs text-gray-400 capitalize">{user?.status ?? 'online'}</p>
          </div>
          <button
            type="button"
            title="User settings"
            aria-label="User settings"
            onClick={onOpenSettings}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <GearIcon />
          </button>
        </div>
      </aside>

      {channelModalOpen && (
        <Suspense fallback={null}>
          <CreateChannelModal open onClose={() => setChannelModalOpen(false)} />
        </Suspense>
      )}
      {inviteOpen && currentServer && (
        <Suspense fallback={null}>
          <InviteModal serverId={currentServer.id} serverName={currentServer.name} onClose={() => setInviteOpen(false)} />
        </Suspense>
      )}
      {serverSettingsOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
        </Suspense>
      )}
      {editingChannel && (
        <Suspense fallback={null}>
          <EditChannelModal channel={editingChannel} onClose={() => setEditingChannel(null)} />
        </Suspense>
      )}
      {reorderOpen && (
        <Suspense fallback={null}>
          <ReorderChannelsModal onClose={() => setReorderOpen(false)} />
        </Suspense>
      )}
      {voiceCardUser && (
        <ProfileCard user={voiceCardUser} onClose={() => setVoiceCardUser(null)} anchorRect={voiceCardRect} />
      )}
      {eventsOpen && currentServer && (
        <Suspense fallback={null}>
          <EventsPanel serverId={currentServer.id} onClose={() => setEventsOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
