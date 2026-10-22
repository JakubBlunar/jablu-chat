import { useTranslation } from 'react-i18next'
import type { ContextMenuItem } from '@/components/ui/ContextMenu'

type ServerMenuActions = Partial<
  Record<
    | 'read'
    | 'profile'
    | 'notifications'
    | 'settings'
    | 'createChannel'
    | 'createCategory'
    | 'reorder'
    | 'invite'
    | 'events'
    | 'roles'
    | 'leaderboard'
    | 'leave',
    () => void
  >
>

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
  return definitions.flatMap(([id, label]) =>
    actions[id] ? [{ id, label, onSelect: actions[id], danger: id === 'leave' }] : []
  )
}
