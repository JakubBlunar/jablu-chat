import { useTranslation } from 'react-i18next'
import { createElement } from 'react'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'
import { ServerMenuIcon, type ServerMenuAction } from '@/components/server/ServerMenuIcon'

type ServerMenuActions = Partial<Record<ServerMenuAction, () => void>>

/** Callers supply only actions they can perform. The rail, desktop sidebar and
 * mobile sidebar share labels and ordering while owning their dialog state. */
export function useServerMenuItems(actions: ServerMenuActions, eventCount = 0): ContextMenuItem[] {
  const { t } = useTranslation('nav')
  const { t: tc } = useTranslation('channels')
  const definitions: [keyof ServerMenuActions, string][] = [
    ['read', tc('sidebar.markAllAsRead')],
    ['profile', t('profileEdit')],
    ['notifications', tc('sidebar.notificationSettings')],
    ['settings', t('serverSettings')],
    ['createChannel', t('createChannelTitle')],
    ['createCategory', tc('sidebar.createCategory')],
    ['reorder', tc('sidebar.reorderChannels')],
    ['invite', t('invitePeople')],
    ['events', `${t('events')}${eventCount > 0 ? ` (${eventCount})` : ''}`],
    ['roles', t('changeRoles')],
    ['leaderboard', t('leaderboard')],
    ['leave', t('leaveServerTitle')]
  ]
  const labels = new Map(definitions)
  const groups: { id: string; label?: string; actions: ServerMenuAction[] }[] = [
    {
      id: 'server-management',
      label: t('serverActions'),
      actions: ['settings', 'reorder', 'createChannel', 'createCategory']
    },
    {
      id: 'personal-actions',
      label: t('personalServerActions'),
      actions: ['profile', 'leaderboard', 'read', 'notifications', 'invite', 'events', 'roles']
    },
    { id: 'leave-server', actions: ['leave'] }
  ]
  return groups.flatMap((group): ContextMenuItem[] => {
    const items = group.actions
      .filter((id) => actions[id])
      .map((id) => ({
        id,
        label: labels.get(id)!,
        icon: createElement(ServerMenuIcon, { action: id }),
        onSelect: actions[id],
        danger: id === 'leave'
      }))
    return items.length ? [{ id: group.id, separator: true, label: group.label }, ...items] : []
  })
}
