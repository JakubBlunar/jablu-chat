import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Permission } from '@chat/shared'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useNavigationStore } from '@/stores/navigation.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useServerStore } from '@/stores/server.store'
import { usePermissions } from '@/hooks/usePermissions'
import type { Command } from './registry'
import {
  BellIcon,
  ChatIcon,
  CheckIcon,
  HashIcon,
  KeyboardIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  StatusDot,
  UserPlusIcon,
  VoiceIcon
} from './icons'

function dispatch(event: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(event, { detail }))
}

function getDmDisplayName(
  conv: {
    isGroup?: boolean
    groupName?: string | null
    members: { userId: string; username: string; displayName?: string | null }[]
  },
  myUserId: string | undefined,
  fallback: string
): string {
  if (conv.isGroup && conv.groupName) return conv.groupName
  const others = conv.members.filter((m) => m.userId !== myUserId)
  if (others.length === 0) return fallback
  return others.map((m) => m.displayName || m.username).join(', ')
}

export function useBuiltInCommands(): Command[] {
  const { t } = useTranslation('nav')
  const channels = useChannelStore((s) => s.channels)
  const conversations = useDmStore((s) => s.conversations)
  const servers = useServerStore((s) => s.servers)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const myUserId = useAuthStore((s) => s.user?.id)
  const updateStatus = useAuthStore((s) => s.updateStatus)
  const navigateToChannel = useNavigationStore((s) => s.navigateToChannel)
  const navigateToDm = useNavigationStore((s) => s.navigateToDm)
  const ackServer = useReadStateStore((s) => s.ackServer)

  const { has: hasPerm, isOwner } = usePermissions(currentServerId)
  const canManageServer = isOwner || hasPerm(Permission.MANAGE_SERVER)
  const canManageChannels = isOwner || hasPerm(Permission.MANAGE_CHANNELS)
  const currentServer = useServerStore((s) =>
    s.currentServerId ? s.servers.find((sv) => sv.id === s.currentServerId) ?? null : null
  )
  const xpEnabledHere = !!currentServer?.xpEnabled

  return useMemo<Command[]>(() => {
    const commands: Command[] = []

    for (const ch of channels) {
      commands.push({
        id: `nav:channel:${ch.id}`,
        section: 'navigation',
        label: ch.name,
        keywords: ['channel', ch.type],
        icon: ch.type === 'voice' ? <VoiceIcon /> : <HashIcon />,
        run: async ({ navigate, close }) => {
          close()
          const path = await navigateToChannel({ serverId: ch.serverId, channelId: ch.id })
          if (path) navigate(path)
        }
      })
    }

    for (const conv of conversations) {
      commands.push({
        id: `nav:dm:${conv.id}`,
        section: 'navigation',
        label: getDmDisplayName(conv, myUserId, 'Unknown'),
        keywords: ['dm', 'direct message'],
        icon: <ChatIcon />,
        run: async ({ navigate, close }) => {
          close()
          const path = await navigateToDm({ conversationId: conv.id })
          if (path) navigate(path)
        }
      })
    }

    for (const srv of servers) {
      commands.push({
        id: `nav:server:${srv.id}`,
        section: 'navigation',
        label: srv.name,
        keywords: ['server'],
        icon: <ServerIcon />,
        hint: t('memberCount', { count: srv.memberCount }),
        run: async ({ navigate, close }) => {
          close()
          const path = await navigateToChannel({ serverId: srv.id })
          if (path) navigate(path)
        }
      })
    }

    commands.push({
      id: 'action:new-channel',
      section: 'actions',
      label: t('cmdCreateChannel'),
      keywords: ['new', 'add', 'channel'],
      icon: <PlusIcon />,
      available: !!currentServerId && canManageChannels,
      run: ({ close }) => {
        close()
        dispatch('open-create-channel')
      }
    })

    commands.push({
      id: 'action:new-dm',
      section: 'actions',
      label: t('cmdNewDm'),
      keywords: ['dm', 'message', 'new'],
      icon: <ChatIcon />,
      run: ({ navigate, close }) => {
        close()
        navigate('/channels/@me')
      }
    })

    commands.push({
      id: 'action:add-friend',
      section: 'actions',
      label: t('cmdAddFriend'),
      keywords: ['friend', 'invite'],
      icon: <UserPlusIcon />,
      run: ({ navigate, close }) => {
        close()
        navigate('/channels/@me')
        setTimeout(() => dispatch('open-add-friend'), 50)
      }
    })

    commands.push({
      id: 'action:join-server',
      section: 'actions',
      label: t('cmdJoinServer'),
      keywords: ['invite', 'join'],
      icon: <ServerIcon />,
      run: ({ close }) => {
        close()
        dispatch('open-join-server')
      }
    })

    commands.push({
      id: 'action:leaderboard',
      section: 'actions',
      label: t('cmdOpenLeaderboard'),
      keywords: ['xp', 'level', 'rank', 'leaderboard'],
      icon: <ServerIcon />,
      available: !!currentServerId && xpEnabledHere,
      run: ({ close }) => {
        close()
        dispatch('open-leaderboard')
      }
    })

    commands.push({
      id: 'action:mark-server-read',
      section: 'actions',
      label: t('cmdMarkServerRead'),
      keywords: ['unread', 'ack', 'read'],
      icon: <CheckIcon />,
      available: !!currentServerId,
      run: ({ close }) => {
        close()
        if (currentServerId) ackServer(currentServerId)
      }
    })

    const setStatus = (status: 'online' | 'idle' | 'dnd' | 'offline') => {
      void updateStatus(status).catch(() => {})
    }

    commands.push({
      id: 'status:online',
      section: 'status',
      label: t('cmdStatusOnline'),
      keywords: ['presence', 'status', 'online'],
      icon: <StatusDot colorClass="bg-emerald-500" />,
      run: ({ close }) => {
        close()
        setStatus('online')
      }
    })

    commands.push({
      id: 'status:idle',
      section: 'status',
      label: t('cmdStatusIdle'),
      keywords: ['presence', 'away', 'idle'],
      icon: <StatusDot colorClass="bg-amber-400" />,
      run: ({ close }) => {
        close()
        setStatus('idle')
      }
    })

    commands.push({
      id: 'status:dnd',
      section: 'status',
      label: t('cmdStatusDnd'),
      keywords: ['presence', 'dnd', 'busy', 'mute'],
      icon: <StatusDot colorClass="bg-rose-500" />,
      run: ({ close }) => {
        close()
        setStatus('dnd')
      }
    })

    commands.push({
      id: 'status:invisible',
      section: 'status',
      label: t('cmdStatusInvisible'),
      keywords: ['presence', 'offline', 'invisible'],
      icon: <StatusDot colorClass="bg-gray-500" />,
      run: ({ close }) => {
        close()
        setStatus('offline')
      }
    })

    const openSettings = (tab: string | undefined, close: () => void) => {
      close()
      dispatch('open-settings', tab)
    }

    commands.push({
      id: 'settings:open',
      section: 'settings',
      label: t('cmdOpenSettings'),
      keywords: ['preferences', 'options'],
      icon: <SettingsIcon />,
      run: ({ close }) => openSettings(undefined, close)
    })

    commands.push({
      id: 'settings:profile',
      section: 'settings',
      label: t('cmdSettingsProfile'),
      keywords: ['account', 'me', 'avatar'],
      icon: <SettingsIcon />,
      run: ({ close }) => openSettings('profile', close)
    })

    commands.push({
      id: 'settings:notifications',
      section: 'settings',
      label: t('cmdSettingsNotifications'),
      keywords: ['push', 'alerts', 'sounds'],
      icon: <BellIcon />,
      run: ({ close }) => openSettings('notifications', close)
    })

    commands.push({
      id: 'settings:voice',
      section: 'settings',
      label: t('cmdSettingsVoice'),
      keywords: ['mic', 'camera', 'audio'],
      icon: <VoiceIcon />,
      run: ({ close }) => openSettings('voice', close)
    })

    commands.push({
      id: 'settings:shortcuts',
      section: 'settings',
      label: t('cmdSettingsShortcuts'),
      keywords: ['keys', 'hotkeys'],
      icon: <KeyboardIcon />,
      shortcut: ['Ctrl', '/'],
      run: ({ close }) => openSettings('shortcuts', close)
    })

    commands.push({
      id: 'mod:server-settings',
      section: 'mod',
      label: t('cmdOpenServerSettings'),
      keywords: ['moderation', 'manage', 'admin'],
      icon: <ShieldIcon />,
      available: !!currentServerId && canManageServer,
      run: ({ close }) => {
        close()
        dispatch('open-server-settings')
      }
    })

    commands.push({
      id: 'help:shortcuts',
      section: 'help',
      label: t('cmdShowShortcuts'),
      keywords: ['help', 'keys', 'cheatsheet'],
      icon: <KeyboardIcon />,
      shortcut: ['?'],
      run: ({ close }) => openSettings('shortcuts', close)
    })

    return commands
  }, [
    channels,
    conversations,
    servers,
    myUserId,
    currentServerId,
    canManageServer,
    canManageChannels,
    xpEnabledHere,
    navigateToChannel,
    navigateToDm,
    ackServer,
    updateStatus,
    t
  ])
}
