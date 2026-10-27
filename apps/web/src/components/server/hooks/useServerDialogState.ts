import type { Channel, ChannelCategory } from '@chat/shared'
import { useEffect, useState } from 'react'
export function useServerDialogState(serverId: string | null) {
  const [ownerServerId, setOwnerServerId] = useState(serverId)
  const [channelModalOpen, setChannelModalOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [reorderOpen, setReorderOpen] = useState(false)
  const [eventsOpen, setEventsOpen] = useState(false)
  const [eventsInitialId, setEventsInitialId] = useState<string | null>(null)
  const [serverNotifOpen, setServerNotifOpen] = useState(false)
  const [createCategoryId, setCreateCategoryId] = useState<string | null>(null)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ChannelCategory | null>(null)
  const [rolePickerOpen, setRolePickerOpen] = useState(false)
  useEffect(() => {
    if (ownerServerId === serverId) return
    setChannelModalOpen(false)
    setEditingChannel(null)
    setInviteOpen(false)
    setServerSettingsOpen(false)
    setProfileOpen(false)
    setLeaderboardOpen(false)
    setReorderOpen(false)
    setEventsOpen(false)
    setEventsInitialId(null)
    setServerNotifOpen(false)
    setCreateCategoryId(null)
    setCreateCategoryOpen(false)
    setEditingCategory(null)
    setRolePickerOpen(false)
    setOwnerServerId(serverId)
  }, [serverId, ownerServerId])
  return {
    ownerServerId,
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
  }
}
export type ServerDialogState = ReturnType<typeof useServerDialogState>
