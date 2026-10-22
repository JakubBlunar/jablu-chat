import type { Channel, ChannelCategory } from '@chat/shared'
import type { HTMLAttributes, ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { api } from '@/lib/api'
import { useReadStateStore } from '@/stores/readState.store'
import { useNotifPrefStore, type NotifLevel } from '@/stores/notifPref.store'
import { showToast } from '@/stores/toast.store'

export function ChannelContextMenu({
  channel,
  canManage,
  onEdit,
  onOpenPinned,
  children
}: {
  channel: Channel
  canManage: boolean
  onEdit: () => void
  onOpenPinned?: () => void
  children: ReactElement<HTMLAttributes<HTMLElement>>
}) {
  const { t } = useTranslation('channels')
  const { t: tChat } = useTranslation('chat')
  const level = useNotifPrefStore((s) => s.getEffective(channel.id, channel.serverId))
  const items: ContextMenuItem[] = []
  if (channel.type !== 'voice') {
    items.push({
      id: 'read',
      label: tChat('markAsRead'),
      onSelect: () => {
        void useReadStateStore.getState().ackChannel(channel.id)
      }
    })
    items.push({
      id: 'notifications',
      label: t('sidebar.notificationSettings'),
      children: (['all', 'mentions', 'none'] as NotifLevel[]).map((value) => ({
        id: value,
        label: t(
          value === 'all'
            ? 'notifications.allMessages'
            : value === 'mentions'
              ? 'notifications.mentionsOnly'
              : 'notifications.muted'
        ),
        checked: level === value,
        onSelect: () => {
          void api
            .setNotifPref(channel.id, value)
            .then(() => useNotifPrefStore.getState().set(channel.id, value))
            .catch(() => showToast(t('sidebar.notificationSettings'), t('errors.notificationSaveFailed')))
        }
      }))
    })
    if (channel.type === 'text' && onOpenPinned)
      items.push({ id: 'pins', label: tChat('pinnedMessagesTitle'), onSelect: onOpenPinned })
  }
  if (canManage) items.push({ id: 'edit', label: t('voice.editChannel'), onSelect: onEdit })
  return (
    <ContextMenu label={channel.name} items={items}>
      {children}
    </ContextMenu>
  )
}

export function CategoryContextMenu({
  category,
  canManage,
  onCreate,
  onEdit,
  children
}: {
  category: ChannelCategory
  canManage: boolean
  onCreate: () => void
  onEdit: () => void
  children: ReactElement<HTMLAttributes<HTMLElement>>
}) {
  const { t } = useTranslation('nav')
  const { t: ta } = useTranslation('a11y')
  const items: ContextMenuItem[] = canManage
    ? [
        { id: 'create', label: t('createChannelTitle'), onSelect: onCreate },
        { id: 'edit', label: ta('editCategoryNamed', { name: category.name }), onSelect: onEdit }
      ]
    : []
  return (
    <ContextMenu label={category.name} items={items}>
      {children}
    </ContextMenu>
  )
}
