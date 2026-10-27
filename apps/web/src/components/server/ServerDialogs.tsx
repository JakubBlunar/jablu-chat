import { useAuthStore } from '@/stores/auth.store'
import { useServerStore } from '@/stores/server.store'
import { lazy, Suspense } from 'react'
import type { ServerDialogState } from './hooks/useServerDialogState'
const CreateChannelModal = lazy(() =>
  import('@/components/channel/CreateChannelModal').then((m) => ({ default: m.CreateChannelModal }))
)
const EditChannelModal = lazy(() =>
  import('@/components/channel/EditChannelModal').then((m) => ({ default: m.EditChannelModal }))
)
const InviteModal = lazy(() => import('@/components/server/InviteModal').then((m) => ({ default: m.InviteModal })))
const ServerSettingsModal = lazy(() =>
  import('@/components/server/ServerSettingsModal').then((m) => ({ default: m.ServerSettingsModal }))
)
const LeaderboardModal = lazy(() =>
  import('@/components/server/LeaderboardModal').then((m) => ({ default: m.LeaderboardModal }))
)
const ReorderChannelsModal = lazy(() =>
  import('@/components/server/ReorderChannelsModal').then((m) => ({ default: m.ReorderChannelsModal }))
)
const ServerNotifModal = lazy(() =>
  import('@/components/server/ServerNotifModal').then((m) => ({ default: m.ServerNotifModal }))
)
const CreateCategoryModal = lazy(() =>
  import('@/components/channel/CreateCategoryModal').then((m) => ({ default: m.CreateCategoryModal }))
)
const EditCategoryModal = lazy(() =>
  import('@/components/channel/EditCategoryModal').then((m) => ({ default: m.EditCategoryModal }))
)
const RolePickerModal = lazy(() =>
  import('@/components/server/RolePickerModal').then((m) => ({ default: m.RolePickerModal }))
)
const EventsPanel = lazy(() => import('@/components/events/EventsPanel').then((m) => ({ default: m.EventsPanel })))
const ServerProfileModal = lazy(() => import('./ServerProfileModal').then((m) => ({ default: m.ServerProfileModal })))
export function ServerDialogs({ state }: { state: ServerDialogState }) {
  const currentServer = useServerStore((s) => s.servers.find((server) => server.id === s.currentServerId) ?? null)
  const user = useAuthStore((s) => s.user)
  const {
    channelModalOpen,
    setChannelModalOpen,
    editingChannel,
    setEditingChannel,
    inviteOpen,
    setInviteOpen,
    serverSettingsOpen,
    setServerSettingsOpen,
    profileOpen,
    setProfileOpen,
    leaderboardOpen,
    setLeaderboardOpen,
    reorderOpen,
    setReorderOpen,
    eventsOpen,
    setEventsOpen,
    eventsInitialId,
    setEventsInitialId,
    serverNotifOpen,
    setServerNotifOpen,
    createCategoryId,
    setCreateCategoryId,
    createCategoryOpen,
    setCreateCategoryOpen,
    editingCategory,
    setEditingCategory,
    rolePickerOpen,
    setRolePickerOpen
  } = state
  if (!currentServer || state.ownerServerId !== currentServer.id) return null
  return (
    <>
      {channelModalOpen && (
        <Suspense fallback={null}>
          <CreateChannelModal
            open
            onClose={() => {
              setChannelModalOpen(false)
              setCreateCategoryId(null)
            }}
            defaultCategoryId={createCategoryId}
          />
        </Suspense>
      )}
      {inviteOpen && currentServer && (
        <Suspense fallback={null}>
          <InviteModal
            serverId={currentServer.id}
            serverName={currentServer.name}
            vanityCode={currentServer.vanityCode}
            onClose={() => setInviteOpen(false)}
          />
        </Suspense>
      )}
      {serverSettingsOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerSettingsModal server={currentServer} onClose={() => setServerSettingsOpen(false)} />
        </Suspense>
      )}
      {profileOpen && currentServer && user && (
        <Suspense fallback={null}>
          <ServerProfileModal serverId={currentServer.id} userId={user.id} onClose={() => setProfileOpen(false)} />
        </Suspense>
      )}
      {leaderboardOpen && currentServer && currentServer.xpEnabled && (
        <Suspense fallback={null}>
          <LeaderboardModal serverId={currentServer.id} onClose={() => setLeaderboardOpen(false)} />
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
      {eventsOpen && currentServer && (
        <Suspense fallback={null}>
          <EventsPanel
            serverId={currentServer.id}
            initialEventId={eventsInitialId ?? undefined}
            onClose={() => {
              setEventsOpen(false)
              setEventsInitialId(null)
            }}
          />
        </Suspense>
      )}
      {serverNotifOpen && currentServer && (
        <Suspense fallback={null}>
          <ServerNotifModal
            serverId={currentServer.id}
            serverName={currentServer.name}
            onClose={() => setServerNotifOpen(false)}
          />
        </Suspense>
      )}
      {createCategoryOpen && (
        <Suspense fallback={null}>
          <CreateCategoryModal onClose={() => setCreateCategoryOpen(false)} />
        </Suspense>
      )}
      {editingCategory && (
        <Suspense fallback={null}>
          <EditCategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} />
        </Suspense>
      )}
      {rolePickerOpen && currentServer && (
        <Suspense fallback={null}>
          <RolePickerModal onClose={() => setRolePickerOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
