import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChannelSidebar } from '@/components/channel/ChannelSidebar'
import { Spinner } from '@/components/Spinner'
import { DmSidebar } from '@/components/dm/DmSidebar'
import { MemberDrawer } from '@/components/member/MemberDrawer'
import { MemberSidebar } from '@/components/member/MemberSidebar'
import { MessageArea } from '@/components/chat/MessageArea'
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer'
import { ServerSidebar } from '@/components/server/ServerSidebar'
import { ToastContainer } from '@/components/ToastContainer'
import { VoiceAudioManager } from '@/components/voice/VoiceAudioManager'
import { useAppBadge } from '@/hooks/useAppBadge'
import { useIdleDetector } from '@/hooks/useIdleDetector'
import { useIsMobile } from '@/hooks/useMobile'
import { useRouteSync } from '@/hooks/useRouteSync'
import { useSortedChannels } from '@/hooks/useSortedChannels'
import { useSocket } from '@/hooks/useSocket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'
import { PwaInstallBanner } from '@/components/PwaInstallBanner'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

const SettingsModal = lazy(() =>
  import('@/components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
const VoiceRoom = lazy(() => import('@/components/voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))
const ScreenSharePicker = lazy(() =>
  import('@/components/voice/ScreenSharePicker').then((m) => ({ default: m.ScreenSharePicker }))
)

function ConnectionBanner({ isConnected }: { isConnected: boolean }) {
  const [showReconnected, setShowReconnected] = useState(false)
  const hasConnected = useRef(false)
  const wasDisconnected = useRef(false)

  useEffect(() => {
    if (!isConnected) {
      if (hasConnected.current) {
        wasDisconnected.current = true
      }
      setShowReconnected(false)
    } else {
      hasConnected.current = true
      if (wasDisconnected.current) {
        wasDisconnected.current = false
        setShowReconnected(true)
        const t = setTimeout(() => setShowReconnected(false), 3000)
        return () => clearTimeout(t)
      }
    }
  }, [isConnected])

  if (!isConnected && hasConnected.current) {
    return (
      <div className="shrink-0 bg-amber-600 px-4 py-1.5 text-center text-xs font-medium text-white" role="status" aria-live="polite">
        Connection lost. Reconnecting...
      </div>
    )
  }

  if (showReconnected) {
    return (
      <div className="shrink-0 bg-emerald-600 px-4 py-1.5 text-center text-xs font-medium text-white" role="status" aria-live="polite">Reconnected</div>
    )
  }

  return null
}

function HamburgerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function MembersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  )
}

function MobileTopBar({
  title,
  onMenuClick,
  onMembersClick,
  showMembers
}: {
  title: string
  onMenuClick: () => void
  onMembersClick?: () => void
  showMembers?: boolean
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-black/20 bg-surface px-2 shadow-sm">
      <button
        type="button"
        aria-label="Open navigation menu"
        onClick={onMenuClick}
        className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
      >
        <HamburgerIcon />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{title}</h1>
      {showMembers && onMembersClick && (
        <button
          type="button"
          aria-label="Toggle member list"
          onClick={onMembersClick}
          className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <MembersIcon />
        </button>
      )}
    </header>
  )
}

export function MainLayout() {
  useRouteSync()
  const navigate = useNavigate()

  const { socket, isConnected } = useSocket()
  const isMobile = useIsMobile()

  const openNavDrawer = useLayoutStore((s) => s.openNavDrawer)
  const openMemberDrawer = useLayoutStore((s) => s.openMemberDrawer)
  const memberSidebarVisible = useLayoutStore((s) => s.memberSidebarVisible)

  const onIdle = useCallback(() => {
    const s = socket
    if (s?.connected) {
      s.emit('activity:idle')
    }
    const user = useAuthStore.getState().user
    if (user && user.status === 'online') {
      useAuthStore.getState().setUser({ ...user, status: 'idle' })
      useMemberStore.getState().setUserStatus(user.id, 'idle')
    }
  }, [socket])

  const onActive = useCallback(() => {
    const s = socket
    if (s?.connected) {
      s.emit('activity:active')
    }
    const user = useAuthStore.getState().user
    if (user && user.status === 'idle') {
      useAuthStore.getState().setUser({ ...user, status: 'online' })
      useMemberStore.getState().setUserStatus(user.id, 'online')
    }
  }, [socket])

  useIdleDetector(onIdle, onActive)
  useAppBadge()

  const viewMode = useServerStore((s) => s.viewMode)
  const fetchServers = useServerStore((s) => s.fetchServers)
  const servers = useServerStore((s) => s.servers)
  const serversLoading = useServerStore((s) => s.isLoading)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const currentServer = useServerStore((s) => {
    if (!s.currentServerId) return null
    return s.servers.find((x) => x.id === s.currentServerId) ?? null
  })

  const channels = useChannelStore((s) => s.channels)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const channelLoadedServerId = useChannelStore((s) => s.loadedServerId)
  const isNavigating = useNavigationStore((s) => s.isNavigating)

  const { textChannels } = useSortedChannels(channels)

  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const clearMessages = useMessageStore((s) => s.clearMessages)

  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom)
  const voiceChannelName = useVoiceConnectionStore((s) => s.currentChannelName)
  const currentConvId = useDmStore((s) => s.currentConversationId)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>()
  const openSettings = useCallback(() => setSettingsOpen(true), [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string | undefined
      if (detail) setSettingsInitialTab(detail)
      setSettingsOpen(true)
    }
    window.addEventListener('open-settings', handler)
    return () => window.removeEventListener('open-settings', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSettingsInitialTab('shortcuts')
        setSettingsOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const prevServerRef = useRef<string | null>(null)

  useEffect(() => {
    void fetchServers()
  }, [fetchServers])

  // Auto-redirect: server view with no server → navigate to first server
  // Also redirect if the server ID in the URL doesn't match any known server
  useEffect(() => {
    if (viewMode !== 'server') return
    if (serversLoading || servers.length === 0) return
    if (!currentServerId) {
      navigate(`/channels/${servers[0].id}`, { replace: true })
      return
    }
    const exists = servers.some((s) => s.id === currentServerId)
    if (!exists) {
      navigate('/channels/@me', { replace: true })
    }
  }, [viewMode, servers, serversLoading, currentServerId, navigate])

  // Fetch channels & members when server changes
  useEffect(() => {
    if (viewMode !== 'server') return
    if (!currentServerId) {
      prevServerRef.current = null
      clearMessages()
      return
    }

    if (prevServerRef.current !== currentServerId) {
      prevServerRef.current = currentServerId
      if (channelLoadedServerId !== currentServerId) {
        fetchChannels(currentServerId).catch(() => {
          navigate('/channels/@me', { replace: true })
        })
        void fetchMembers(currentServerId)
      }
    }
  }, [viewMode, currentServerId, fetchChannels, fetchMembers, navigate])

  // Auto-redirect: invalid/missing channel → navigate to first text channel
  useEffect(() => {
    if (viewMode !== 'server') return
    if (isNavigating) return
    if (!currentServerId || channels.length === 0) return
    if (channelLoadedServerId !== currentServerId) return
    const valid = currentChannelId != null && channels.some((c) => c.id === currentChannelId)
    if (valid) return
    const firstText = textChannels[0]
    if (firstText) {
      navigate(`/channels/${currentServerId}/${firstText.id}`, { replace: true })
    }
  }, [
    viewMode,
    currentServerId,
    channels,
    currentChannelId,
    textChannels,
    navigate,
    channelLoadedServerId,
    isNavigating
  ])

  const mobileTitle = useMemo(() => {
    if (viewMode === 'dm') return 'Direct Messages'
    if (viewingVoiceRoom && voiceChannelName) return voiceChannelName
    if (currentServer) return currentServer.name
    return 'Jablu'
  }, [viewMode, viewingVoiceRoom, voiceChannelName, currentServer])

  const showMemberSidebar = !isMobile && memberSidebarVisible

  // ─── Mobile layout ───
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
        <VoiceAudioManager />
        <ToastContainer />
        <ConnectionBanner isConnected={isConnected} />
        <PwaInstallBanner />
        <MobileTopBar
          title={mobileTitle}
          onMenuClick={openNavDrawer}
          onMembersClick={viewMode === 'server' ? openMemberDrawer : undefined}
          showMembers={viewMode === 'server'}
        />
        <div className="flex min-h-0 flex-1">
          {viewMode === 'dm' ? (
            <MessageArea mode="dm" contextId={currentConvId} />
          ) : serversLoading && servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              <p className="text-sm text-gray-400">Loading servers...</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">No servers yet</p>
              <p className="max-w-md text-sm text-gray-400">Use the menu to join a server.</p>
            </div>
          ) : viewingVoiceRoom ? (
            <Suspense fallback={<Spinner className="flex-1" />}>
              <VoiceRoom />
            </Suspense>
          ) : (
            <MessageArea mode="channel" contextId={currentChannelId} />
          )}
        </div>
        <MobileNavDrawer onOpenSettings={openSettings} />
        <MemberDrawer />
        <Suspense fallback={null}>
          <ScreenSharePicker />
        </Suspense>
        {settingsOpen && (
          <Suspense fallback={<Spinner className="fixed inset-0 z-50 bg-black/60" />}>
            <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => { setSettingsOpen(false); setSettingsInitialTab(undefined) }} />
          </Suspense>
        )}
      </div>
    )
  }

  // ─── DM layout (desktop/tablet) ───
  if (viewMode === 'dm') {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
        <VoiceAudioManager />
        <ToastContainer />
        <ConnectionBanner isConnected={isConnected} />
        <PwaInstallBanner />
        <div className="flex min-h-0 flex-1">
          <ServerSidebar />
          <DmSidebar onOpenSettings={openSettings} />
          <MessageArea mode="dm" contextId={currentConvId} />
        </div>
        {settingsOpen && (
          <Suspense fallback={<Spinner className="fixed inset-0 z-50 bg-black/60" />}>
            <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => { setSettingsOpen(false); setSettingsInitialTab(undefined) }} />
          </Suspense>
        )}
      </div>
    )
  }

  // ─── Server layout (desktop/tablet) ───
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
      <VoiceAudioManager />
      <ToastContainer />
      <ConnectionBanner isConnected={isConnected} />
      <PwaInstallBanner />
      <div className="flex min-h-0 flex-1">
        <ServerSidebar />
        <ChannelSidebar onOpenSettings={openSettings} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {serversLoading && servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
              <p className="text-sm text-gray-400">Loading servers...</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-lg font-semibold text-white">No servers yet</p>
              <p className="max-w-md text-sm text-gray-400">
                Use the + button in the server list to create your first server.
              </p>
            </div>
          ) : viewingVoiceRoom ? (
            <Suspense fallback={<Spinner className="flex-1" />}>
              <VoiceRoom />
            </Suspense>
          ) : (
            <MessageArea
              mode="channel"
              contextId={currentChannelId}
              memberSidebar={showMemberSidebar ? <MemberSidebar /> : null}
            />
          )}
        </div>
        <Suspense fallback={null}>
          <ScreenSharePicker />
        </Suspense>
      </div>
      {settingsOpen && (
        <Suspense fallback={<Spinner className="fixed inset-0 z-50 bg-black/60" />}>
          <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => { setSettingsOpen(false); setSettingsInitialTab(undefined) }} />
        </Suspense>
      )}
    </div>
  )
}
