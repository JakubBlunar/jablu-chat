import type { Message } from '@chat/shared'
import { Permission as SharedPermission, hasPermission as hasPermFlag } from '@chat/shared'
import { useMemo } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { buildForwardQuoteBlock, buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useComposerPrefillStore } from '@/stores/composer-prefill.store'
import { useServerStore } from '@/stores/server.store'

type Props = {
  message: Message
  sourceChannelId: string
  onClose: () => void
  /** Called after a destination channel is chosen (e.g. close mobile message drawer). */
  onForwarded?: () => void
}

export function ForwardMessageModal({ message, sourceChannelId, onClose, onForwarded }: Props) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const channels = useChannelStore((s) => s.channels)
  const sourceChannelName = channels.find((c) => c.id === sourceChannelId)?.name ?? 'channel'
  const permissionsMap = useChannelPermissionsStore((s) => s.permissionsMap)
  const { orchestratedGoToChannel } = useAppNavigate()

  const destinations = useMemo(() => {
    if (!currentServerId) return []
    return channels
      .filter((c) => c.serverId === currentServerId && c.type === 'text')
      .filter((c) => {
        const p = permissionsMap[c.id]
        if (p === undefined) return true
        return (
          hasPermFlag(p, SharedPermission.VIEW_CHANNEL) &&
          hasPermFlag(p, SharedPermission.SEND_MESSAGES)
        )
      })
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  }, [channels, currentServerId, permissionsMap])

  async function pickChannel(targetId: string) {
    if (!currentServerId) return
    const path = buildMessageJumpPath('channel', {
      serverId: currentServerId,
      channelId: sourceChannelId,
      messageId: message.id
    })
    const url = getMessageShareUrl(path)
    const label = `#${sourceChannelName.replace(/^#/, '')}`
    const quote = buildForwardQuoteBlock(message, label, url)
    useComposerPrefillStore.getState().setPrefill(targetId, null, quote)
    onClose()
    onForwarded?.()
    await orchestratedGoToChannel(currentServerId, targetId)
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-sm" zIndex="z-[140]">
      <h2 className="mb-1 text-lg font-bold text-white">Forward message</h2>
      <p className="mb-3 text-sm text-gray-400">Pick a channel. The composer will open with a quote and link to the original.</p>
      <div className="max-h-64 overflow-y-auto rounded border border-white/10">
        {destinations.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No text channels available.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {destinations.map((ch) => (
              <li key={ch.id}>
                <button
                  type="button"
                  onClick={() => void pickChannel(ch.id)}
                  className="flex w-full px-3 py-2.5 text-left text-sm text-gray-200 transition hover:bg-white/5"
                >
                  <span className="text-gray-500">#</span>
                  {ch.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </ModalOverlay>
  )
}
