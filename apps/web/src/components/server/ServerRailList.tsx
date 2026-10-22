import type { ServerLayoutEntry } from '@chat/shared'
import { reconcileServerLayout } from '@chat/shared'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { resolveMediaUrl } from '@/lib/api'
import { applyLayoutDrop, moveServer } from '@/lib/serverLayout'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'
import type { ServerBadge } from '@/lib/unread'
import { useAuthStore } from '@/stores/auth.store'
import type { Server } from '@/stores/server.store'
import { serverLayoutOwner, useServerLayoutStore } from '@/stores/serverLayout.store'
import { showToast } from '@/stores/toast.store'
import { OrganizeServersModal } from './OrganizeServersModal'
import { ServerContextMenu } from './ServerContextMenu'

function RailItem({
  id,
  disabled,
  title,
  active,
  badge,
  children,
  onClick,
  expanded,
  server,
  menuItems
}: {
  id: string
  disabled: boolean
  title: string
  active?: boolean
  badge?: ServerBadge
  children: ReactNode
  onClick: () => void
  expanded?: boolean
  server?: Server
  menuItems?: ContextMenuItem[]
}) {
  const drag = useDraggable({ id, disabled })
  const drop = useDroppable({ id, disabled })
  const button = (
    <button
      type="button"
      ref={drag.setActivatorNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      aria-label={title}
      aria-expanded={expanded}
      title={title}
      onClick={onClick}
      className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden text-sm font-semibold text-white transition-colors ${
        active ? 'rounded-2xl bg-primary' : 'rounded-[24px] bg-surface hover:rounded-2xl hover:bg-primary'
      } ${drop.isOver ? 'ring-2 ring-primary' : ''}`}
    >
      {children}
    </button>
  )
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      className={`group/pill relative flex w-full justify-center ${drag.isDragging ? 'opacity-30' : ''}`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 z-10 w-1 -translate-y-1/2 rounded-r-full bg-white ${
          active ? 'h-10' : 'h-0 group-hover/pill:h-5'
        }`}
      />
      <div className="relative">
        {server ? (
          <ServerContextMenu server={server} extraItems={menuItems}>
            {button}
          </ServerContextMenu>
        ) : (
          button
        )}
        {badge && badge.mentions > 0 ? (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface-darkest bg-red-500 px-0.5 text-[10px] font-bold text-white">
            {badge.mentions > 10 ? '10+' : badge.mentions}
          </span>
        ) : badge?.unread ? (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-darkest bg-red-500" />
        ) : null}
      </div>
    </div>
  )
}

function RootDropZone({ visible }: { visible: boolean }) {
  const { t } = useTranslation('nav')
  const { setNodeRef, isOver } = useDroppable({ id: 'root', disabled: !visible })
  return (
    <div
      ref={setNodeRef}
      role={visible ? undefined : 'separator'}
      aria-hidden={!visible}
      aria-label={visible ? t('layoutRootDrop') : undefined}
      title={visible ? t('layoutRootDrop') : undefined}
      className={
        visible
          ? `min-h-10 w-12 rounded-lg border border-dashed py-3 text-center text-xs text-gray-400 ${
              isOver ? 'border-primary bg-primary/20' : 'border-white/20'
            }`
          : 'h-0.5 w-8 shrink-0 rounded-full bg-white/15'
      }
    >
      {visible ? '+' : null}
    </div>
  )
}

export function ServerRailList({
  servers,
  currentServerId,
  viewMode,
  navigatingToServerId,
  serverBadges,
  onServerClick,
  isLoading = false
}: {
  servers: Server[]
  isLoading?: boolean
  currentServerId: string | null
  viewMode: 'server' | 'dm'
  navigatingToServerId: string | null
  serverBadges: ReadonlyMap<string, ServerBadge>
  onServerClick: (server: Server) => void
}) {
  const { t } = useTranslation('nav')
  const userId = useAuthStore((s) => s.user?.id)
  const storedEntries = useServerLayoutStore((s) => s.entries)
  const ownerKey = useServerLayoutStore((s) => s.ownerKey)
  const status = useServerLayoutStore((s) => s.status)
  const saving = useServerLayoutStore((s) => s.isSaving)
  const load = useServerLayoutStore((s) => s.load)
  const owned = !!userId && ownerKey === serverLayoutOwner(userId)
  const entries = useMemo(
    () =>
      reconcileServerLayout(
        owned ? storedEntries : [],
        servers.map((s) => s.id)
      ),
    [owned, storedEntries, servers]
  )
  const [organizeOpen, setOrganizeOpen] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const editable = owned && status === 'ready' && !saving && !isLoading
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )
  useEffect(() => {
    if (userId) void load(userId)
  }, [userId, load])

  const save = async (next: ServerLayoutEntry[]) => {
    try {
      await useServerLayoutStore.getState().save(next)
    } catch (error) {
      console.error('Could not save server organization', error)
      showToast(t('organizeServers'), t('layoutSaveError'))
    }
  }
  const handleDrop = ({ active, over }: DragEndEvent) => {
    setDragId(null)
    if (!over || !editable) return
    const translated = active.rect.current.translated
    const after = translated ? translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2 : false
    const next = applyLayoutDrop(entries, String(active.id), String(over.id), after)
    if (next !== entries) void save(next)
  }
  const byId = new Map(servers.map((s) => [s.id, s]))
  const activeServerId = viewMode === 'server' ? currentServerId : null
  const renderServer = (serverId: string) => {
    const server = byId.get(serverId)
    if (!server) return null
    return (
      <RailItem
        key={serverId}
        id={`server:${serverId}`}
        disabled={!editable}
        title={server.name}
        server={server}
        menuItems={[
          {
            id: 'move',
            label: t('contextMoveToFolder'),
            disabled: !editable,
            children: [
              {
                id: 'root',
                label: t('layoutUngrouped'),
                disabled: !editable || entries.some((entry) => entry.type === 'server' && entry.serverId === serverId),
                checked: entries.some((entry) => entry.type === 'server' && entry.serverId === serverId),
                onSelect: () => {
                  void save(moveServer(entries, serverId, null))
                }
              },
              ...entries
                .filter((entry) => entry.type === 'folder')
                .map((folder) => ({
                  id: folder.id,
                  label: folder.name,
                  disabled: !editable || folder.serverIds.includes(serverId),
                  checked: folder.serverIds.includes(serverId),
                  onSelect: () => {
                    void save(moveServer(entries, serverId, folder.id))
                  }
                }))
            ]
          },
          { id: 'organize', label: t('organizeServers'), disabled: !editable, onSelect: () => setOrganizeOpen(true) }
        ]}
        active={activeServerId === serverId}
        badge={activeServerId === serverId ? undefined : serverBadges.get(serverId)}
        onClick={() => onServerClick(server)}
      >
        {server.iconUrl ? (
          <img src={resolveMediaUrl(server.iconUrl)} alt="" className="h-full w-full object-cover" />
        ) : (
          server.name.trim().charAt(0).toUpperCase() || '?'
        )}
        {navigatingToServerId === serverId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </RailItem>
    )
  }
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDragId(String(active.id))}
        onDragEnd={handleDrop}
        onDragCancel={() => setDragId(null)}
      >
        {entries.map((entry) => {
          if (entry.type === 'server') return renderServer(entry.serverId)
          const badge = entry.serverIds.reduce<ServerBadge>(
            (sum, id) => {
              const item = id === activeServerId ? undefined : serverBadges.get(id)
              return { unread: sum.unread || !!item?.unread, mentions: sum.mentions + (item?.mentions ?? 0) }
            },
            { unread: false, mentions: 0 }
          )
          return (
            <div key={entry.id} className="flex w-full flex-col items-center gap-2 rounded-2xl bg-white/[0.04] py-1">
              <RailItem
                id={`folder:${entry.id}`}
                disabled={!editable}
                title={
                  t(entry.collapsed ? 'layoutExpand' : 'layoutCollapse', { name: entry.name }) +
                  (badge.unread ? ` - ${t('layoutFolderUnread', { name: entry.name })}` : '')
                }
                expanded={!entry.collapsed}
                active={entry.collapsed && entry.serverIds.includes(activeServerId ?? '')}
                badge={entry.collapsed ? badge : undefined}
                onClick={() => {
                  if (editable)
                    void save(entries.map((item) => (item === entry ? { ...item, collapsed: !item.collapsed } : item)))
                }}
              >
                {entry.collapsed && entry.serverIds.length > 0 ? (
                  <span className="grid h-9 w-9 grid-cols-2 gap-0.5">
                    {entry.serverIds.slice(0, 4).map((id) => {
                      const server = byId.get(id)
                      return (
                        <span
                          key={id}
                          className="flex items-center justify-center overflow-hidden rounded bg-black/20 text-[9px]"
                        >
                          {server?.iconUrl ? (
                            <img src={resolveMediaUrl(server.iconUrl)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            server?.name.charAt(0)
                          )}
                        </span>
                      )
                    })}
                  </span>
                ) : (
                  <svg aria-hidden className="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
                  </svg>
                )}
              </RailItem>
              {!entry.collapsed && entry.serverIds.map(renderServer)}
            </div>
          )
        })}
        <RootDropZone visible={!!dragId} />
        <DragOverlay>
          {dragId ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-text shadow-xl">
              {dragId.startsWith('server:') ? byId.get(dragId.slice(7))?.name.charAt(0) : '+'}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {owned && status === 'error' && (
        <button
          type="button"
          onClick={() => userId && void load(userId)}
          title={t('layoutLoadError')}
          aria-label={`${t('layoutLoadError')} ${t('layoutRetry')}`}
          className="w-12 rounded-md bg-red-500/10 py-2 text-xs text-red-400"
        >
          {t('layoutRetry')}
        </button>
      )}
      <button
        type="button"
        title={t('organizeServers')}
        aria-label={t('organizeServers')}
        disabled={!editable}
        onClick={() => setOrganizeOpen(true)}
        className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-surface text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
      >
        <svg aria-hidden className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M4 7h16M4 12h16M4 17h16M8 4v6m8-1v6m-6-1v6" />
        </svg>
      </button>
      {organizeOpen && owned && status === 'ready' && (
        <OrganizeServersModal entries={entries} servers={servers} onClose={() => setOrganizeOpen(false)} />
      )}
    </>
  )
}
