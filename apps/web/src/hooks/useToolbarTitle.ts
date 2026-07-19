import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isDesktop } from '@/lib/desktop'
import { getDmDisplayName } from '@/lib/dm'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useServerStore } from '@/stores/server.store'

const APP_NAME = 'Jablu'

export type ToolbarTitle = {
  /** Server name in server view, else null. */
  serverName: string | null
  /** Channel name in server view (when a channel is open), else null. */
  channelName: string | null
  /** DM/group name in DM view (when a conversation is open), else null. */
  dmName: string | null
  isDm: boolean
  /** Flattened single-line label (used for the native window/taskbar title). */
  label: string
}

/**
 * Derives the current toolbar/window title from the active server + channel or
 * DM conversation. On desktop it also mirrors the label into the native window
 * title so the Windows taskbar hover tooltip stays in sync.
 */
export function useToolbarTitle(): ToolbarTitle {
  const viewMode = useServerStore((s) => s.viewMode)
  const currentServerId = useServerStore((s) => s.currentServerId)
  const servers = useServerStore((s) => s.servers)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const channels = useChannelStore((s) => s.channels)
  const currentConversationId = useDmStore((s) => s.currentConversationId)
  const conversations = useDmStore((s) => s.conversations)
  const userId = useAuthStore((s) => s.user?.id)

  const isDm = viewMode === 'dm'

  let serverName: string | null = null
  let channelName: string | null = null
  let dmName: string | null = null
  let label = APP_NAME

  if (isDm) {
    const conv = currentConversationId
      ? conversations.find((c) => c.id === currentConversationId) ?? null
      : null
    dmName = conv ? getDmDisplayName(conv, userId) : null
    label = dmName ?? 'Direct Messages'
  } else {
    const server = currentServerId ? servers.find((s) => s.id === currentServerId) ?? null : null
    const channel =
      currentChannelId && server
        ? channels.find((c) => c.id === currentChannelId && c.serverId === server.id) ?? null
        : null
    serverName = server?.name ?? null
    channelName = channel?.name ?? null
    if (serverName && channelName) label = `${serverName} — #${channelName}`
    else if (serverName) label = serverName
  }

  useEffect(() => {
    if (!isDesktop) return
    const windowTitle = label === APP_NAME ? APP_NAME : `${label} · ${APP_NAME}`
    getCurrentWindow()
      .setTitle(windowTitle)
      .catch(() => {})
  }, [label])

  return { serverName, channelName, dmName, isDm, label }
}
