import { lazy, Suspense, useState, type HTMLAttributes, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { useServerMenuItems } from '@/hooks/useServerMenuItems'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { useAuthStore } from '@/stores/auth.store'
import { useReadStateStore } from '@/stores/readState.store'
import type { Server } from '@/stores/server.store'

const Profile = lazy(() => import('./ServerProfileModal').then((m) => ({ default: m.ServerProfileModal })))
const Notifications = lazy(() => import('./ServerNotifModal').then((m) => ({ default: m.ServerNotifModal })))

/** Shared personal server actions also work on servers that aren't selected. */
export function ServerContextMenu({
  server,
  children,
  extraItems = [],
  openOnClick = false
}: {
  server: Server
  children: ReactElement<HTMLAttributes<HTMLElement>>
  extraItems?: ContextMenuItem[]
  openOnClick?: boolean
}) {
  const userId = useAuthStore((s) => s.user?.id)
  const [dialog, setDialog] = useState<'profile' | 'notifications' | null>(null)
  const personalItems = useServerMenuItems({
    read: () => {
      void useReadStateStore.getState().ackServer(server.id)
    },
    profile: userId ? () => setDialog('profile') : undefined,
    notifications: () => setDialog('notifications')
  })
  const items = [...personalItems, ...extraItems]
  return (
    <>
      <ContextMenu label={server.name} items={items} openOnClick={openOnClick}>
        {children}
      </ContextMenu>
      {dialog &&
        createPortal(
          <Suspense fallback={null}>
            {dialog === 'profile' && userId && (
              <Profile serverId={server.id} userId={userId} onClose={() => setDialog(null)} />
            )}
            {dialog === 'notifications' && (
              <Notifications serverId={server.id} serverName={server.name} onClose={() => setDialog(null)} />
            )}
          </Suspense>,
          document.body
        )}
    </>
  )
}
