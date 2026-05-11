import type { Message } from '@chat/shared'
import { Permission as SharedPermission, hasPermission as hasPermFlag } from '@chat/shared'
import { useMemo, useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { getSocket } from '@/lib/socket'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'

type Props = {
  message: Message
  sourceChannelId: string
  onClose: () => void
  /** Called after a destination channel is chosen (e.g. close mobile message drawer). */
  onForwarded?: () => void
}

export function ForwardMessageModal({ message, sourceChannelId: _sourceChannelId, onClose, onForwarded }: Props) {
  const currentServerId = useServerStore((s) => s.currentServerId)
  const channels = useChannelStore((s) => s.channels)
  const permissionsMap = useChannelPermissionsStore((s) => s.permissionsMap)
  const { orchestratedGoToChannel } = useAppNavigate()
  const [sendingTo, setSendingTo] = useState<string | null>(null)

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
    if (!currentServerId || sendingTo) return
    setSendingTo(targetId)
    const socket = getSocket()
    if (!socket) {
      setSendingTo(null)
      showToast('Forward failed', 'Not connected to server.')
      return
    }
    socket.emit(
      'message:send',
      {
        channelId: targetId,
        forwardFromMessageId: message.id
      },
      (res: { ok?: boolean; message?: Message; error?: string }) => {
        setSendingTo(null)
        if (res?.ok) {
          // The socket broadcast will deliver the message to open listeners;
          // still add directly if we happen to have the target channel open.
          if (res.message && useMessageStore.getState().loadedForChannelId === targetId) {
            useMessageStore.getState().addMessage(res.message)
          }
          onClose()
          onForwarded?.()
          void orchestratedGoToChannel(currentServerId, targetId)
        } else {
          showToast('Forward failed', res?.error ?? 'Could not forward message.')
        }
      }
    )
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-sm" zIndex="z-[140]">
      <h2 className="mb-1 text-lg font-bold text-white">Forward message</h2>
      <p className="mb-3 text-sm text-gray-400">Pick a channel. The message will be posted as a forwarded card.</p>
      <div className="max-h-64 overflow-y-auto rounded border border-white/10">
        {destinations.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No text channels available.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {destinations.map((ch) => {
              const busy = sendingTo === ch.id
              return (
                <li key={ch.id}>
                  <button
                    type="button"
                    disabled={sendingTo !== null}
                    onClick={() => void pickChannel(ch.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    <span className="text-gray-500">#</span>
                    <span className="flex-1">{ch.name}</span>
                    {busy && <span className="text-xs text-gray-400">Sending…</span>}
                  </button>
                </li>
              )
            })}
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
