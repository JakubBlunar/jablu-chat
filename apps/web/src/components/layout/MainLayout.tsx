import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChannelSidebar } from '@/components/channel/ChannelSidebar'
import { Spinner } from '@/components/ui'
import { DmSidebar } from '@/components/dm/DmSidebar'
import { MemberDrawer } from '@/components/member/MemberDrawer'
import { MemberSidebar } from '@/components/member/MemberSidebar'
import { MessageArea } from '@/components/chat/MessageArea'
import { ForumView } from '@/components/forum/ForumView'
import { MobileNavDrawer } from '@/components/layout/MobileNavDrawer'
import { ServerSidebar } from '@/components/server/ServerSidebar'
import { ToastContainer } from '@/components/ToastContainer'
import { VoiceAudioManager } from '@/components/voice/VoiceAudioManager'
import { useAppBadge } from '@/hooks/useAppBadge'
import { useActivityReporter } from '@/hooks/useActivityReporter'
import { useIsMobile } from '@/hooks/useMobile'
import { useRouteSync } from '@/hooks/useRouteSync'
import { useSortedChannels } from '@/hooks/useSortedChannels'
import { useSocket } from '@/hooks/useSocket'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useServerStore } from '@/stores/server.store'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { PwaInstallBanner } from '@/components/PwaInstallBanner'
import { QuickSwitcher } from '@/components/QuickSwitcher'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { OnboardingWizard } from '@/components/server/OnboardingWizard'

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

export function MainLayout() {
  useRouteSync()
  const navigate = useNavigate()

  const { socket, isConnected } = useSocket()
  const isMobile = useIsMobile()

  const openNavDrawer = useLayoutStore((s) => s.openNavDrawer)
  const memberSidebarVisible = useLayoutStore((s) => s.memberSidebarVisible)

  useActivityReporter(socket)
  useAppBadge()

  const viewMode = useServerStore((s) => s.viewMode)
  const fetchServers = useServerStore((s) => s.fetchServers)
  const servers = useServerStore((s) => s.servers)
  const serversLoading = useServerStore((s) => s.isLoading)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const channels = useChannelStore((s) => s.channels)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const channelLoadedServerId = useChannelStore((s) => s.loadedServerId)
  const isNavigating = useNavigationStore((s) => s.isNavigating)

  const { textChannels } = useSortedChannels(channels)
  const currentChannelType = channels.find((c) => c.id === currentChannelId)?.type

  const fetchMembers = useMemberStore((s) => s.fetchMembers)
  const clearMessages = useMessageStore((s) => s.clearMessages)

  const viewingVoiceRoom = useVoiceConnectionStore((s) => s.viewingVoiceRoom)
  const currentConvId = useDmStore((s) => s.currentConversationId)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>()
  const openSettings = useCallback((tab?: string) => {
    if (tab) setSettingsInitialTab(tab)
    setSettingsOpen(true)
  }, [])
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false)

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
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setQuickSwitcherOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isMobile])

  const prevServerRef = useRef<string | null>(null)

  useEffect(() => {
    void fetchServers()
    if (!useBookmarkStore.getState().loaded) useBookmarkStore.getState().fetchIds()
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
        void useChannelPermissionsStore.getState().fetchChannelPermissions(currentServerId)
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

  const showMemberSidebar = !isMobile && memberSidebarVisible

  // ─── Mobile layout ───
  if (isMobile) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
        <VoiceAudioManager />
        <ToastContainer />
        <ConnectionBanner isConnected={isConnected} />
        <PwaInstallBanner />
        <div className="flex min-h-0 flex-1">
          {viewMode === 'dm' ? (
            <MessageArea mode="dm" contextId={currentConvId} />
          ) : serversLoading && servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-12 shrink-0 items-center gap-1 border-b border-black/20 bg-surface px-2 shadow-sm">
                <button type="button" aria-label="Open navigation menu" onClick={openNavDrawer} className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white">
                  <HamburgerIcon />
                </button>
              </header>
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Spinner size="xl" />
                <p className="text-sm text-gray-400">Loading servers...</p>
              </div>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex h-12 shrink-0 items-center gap-1 border-b border-black/20 bg-surface px-2 shadow-sm">
                <button type="button" aria-label="Open navigation menu" onClick={openNavDrawer} className="flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white">
                  <HamburgerIcon />
                </button>
              </header>
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-lg font-semibold text-white">No servers yet</p>
                <p className="max-w-md text-sm text-gray-400">Use the menu to join a server.</p>
              </div>
            </div>
          ) : viewingVoiceRoom ? (
            <Suspense fallback={<Spinner size="lg" className="flex-1" />}>
              <VoiceRoom />
            </Suspense>
          ) : currentChannelType === 'forum' && currentChannelId ? (
            <ForumView channelId={currentChannelId} onOpenNav={openNavDrawer} />
          ) : (
            <MessageArea mode="channel" contextId={currentChannelId} />
          )}
        </div>
        <MobileNavDrawer onOpenSettings={openSettings} onOpenQuickSwitcher={() => setQuickSwitcherOpen(true)} />
        <MemberDrawer />
        <Suspense fallback={null}>
          <ScreenSharePicker />
        </Suspense>
        <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
        {settingsOpen && (
          <Suspense fallback={<Spinner size="lg" className="fixed inset-0 z-50 bg-black/60" />}>
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
        <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
        {settingsOpen && (
          <Suspense fallback={<Spinner size="lg" className="fixed inset-0 z-50 bg-black/60" />}>
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
              <Spinner size="xl" />
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
            <Suspense fallback={<Spinner size="lg" className="flex-1" />}>
              <VoiceRoom />
            </Suspense>
          ) : currentChannelType === 'forum' && currentChannelId ? (
            <ForumView channelId={currentChannelId} />
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
      <QuickSwitcher open={quickSwitcherOpen} onClose={() => setQuickSwitcherOpen(false)} />
      {settingsOpen && (
        <Suspense fallback={<Spinner size="lg" className="fixed inset-0 z-50 bg-black/60" />}>
          <SettingsModal open={settingsOpen} initialTab={settingsInitialTab} onClose={() => { setSettingsOpen(false); setSettingsInitialTab(undefined) }} />
        </Suspense>
      )}
      {viewMode === 'server' && <OnboardingWizard />}
    </div>
  )
}
