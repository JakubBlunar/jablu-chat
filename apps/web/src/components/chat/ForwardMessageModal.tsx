import type { Message } from '@chat/shared'
import { Permission as SharedPermission, hasPermission as hasPermFlag } from '@chat/shared'
import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { requestMessageAction } from '@/lib/messageActionTransport'
import { messageActionError } from '@/lib/messageActionError'
import { buildMessageJumpPath } from '@/lib/messageLink'
import { useChannelPermissionsStore } from '@/stores/channel-permissions.store'
import { useChannelStore } from '@/stores/channel.store'
import { useMessageStore } from '@/stores/message.store'
import { useServerStore } from '@/stores/server.store'
import { showToast } from '@/stores/toast.store'

type Props = {
  message: Message
  sourceChannelId: string
  onClose: () => void
  onForwarded?: () => void
}

export function ForwardMessageModal({ message, sourceChannelId, onClose, onForwarded }: Props) {
  const { t } = useTranslation('chat')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const channels = useChannelStore((s) => s.channels)
  const permissionsMap = useChannelPermissionsStore((s) => s.permissionsMap)
  const { orchestratedGoToChannel } = useAppNavigate()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [openDestination, setOpenDestination] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)
  const attemptIds = useRef(new Map<string, string>())
  const destinationGroup = useId()

  const destinations = useMemo(() => {
    if (!currentServerId) return []
    return channels
      .filter((c) => c.serverId === currentServerId && c.type === 'text')
      .filter((c) => {
        const p = permissionsMap[c.id]
        return (
          p === undefined ||
          (hasPermFlag(p, SharedPermission.VIEW_CHANNEL) && hasPermFlag(p, SharedPermission.SEND_MESSAGES))
        )
      })
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
  }, [channels, currentServerId, permissionsMap])
  const visible = destinations.filter((channel) =>
    channel.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  )
  const selected = destinations.find((channel) => channel.id === selectedId)
  const source = channels.find((channel) => channel.id === sourceChannelId)

  const close = () => {
    if (!active.current) onClose()
  }

  async function send() {
    if (!currentServerId || !selected || active.current) return
    active.current = true
    setSending(true)
    setError(null)
    try {
      let clientMessageId = attemptIds.current.get(selected.id)
      if (!clientMessageId) {
        clientMessageId = crypto.randomUUID()
        attemptIds.current.set(selected.id, clientMessageId)
      }
      const response = await requestMessageAction('message:send', {
        channelId: selected.id,
        forwardFromMessageId: message.id,
        clientMessageId
      })
      if (!response.message || response.message.id !== clientMessageId)
        throw new Error('Forwarded message was not confirmed')
      if (useMessageStore.getState().loadedForChannelId === selected.id) {
        useMessageStore.getState().addMessage(response.message)
      }
      const path = buildMessageJumpPath('channel', {
        serverId: currentServerId,
        channelId: selected.id,
        messageId: response.message.id
      })
      showToast(t('forwardSent'), t('forwardSentHint', { channel: selected.name }), path)
      onClose()
      onForwarded?.()
      if (openDestination) {
        void orchestratedGoToChannel(currentServerId, selected.id).catch((error) => {
          console.error('Could not open forwarded destination', error)
          showToast(t('forwardSent'), t('forwardOpenFailed'), path)
        })
      }
    } catch (error) {
      console.error('Could not forward message', error)
      setError(messageActionError(error))
    } finally {
      active.current = false
      setSending(false)
    }
  }

  return (
    <ModalOverlay onClose={close} aria-label={t('forwardTitle')} maxWidth="max-w-md" zIndex="z-[140]">
      <h2 className="mb-1 text-lg font-bold text-white">{t('forwardTitle')}</h2>
      <p className="mb-3 text-sm text-gray-400">{t('forwardHint')}</p>
      <blockquote className="mb-4 rounded-lg border-l-2 border-primary/50 bg-white/5 p-3 text-sm">
        <p className="mb-1 text-xs text-gray-400">
          {message.author?.displayName ?? message.author?.username ?? t('deletedUser')}
          {source && ` · #${source.name}`}
        </p>
        <p className="line-clamp-4 whitespace-pre-wrap break-words text-gray-200">
          {message.content ?? message.forwardedFrom?.content ?? t('emptyMessage')}
        </p>
        {!!message.attachments?.length && (
          <p className="mt-1 text-xs text-gray-400">{t('forwardAttachments', { count: message.attachments.length })}</p>
        )}
      </blockquote>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t('forwardSearch')}
        placeholder={t('forwardSearch')}
        disabled={sending}
        className="mb-2 min-h-11 w-full rounded-lg bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-primary"
      />
      <div className="max-h-56 overflow-y-auto rounded border border-white/10">
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">
            {t(destinations.length ? 'forwardNoMatches' : 'forwardNoChannels')}
          </p>
        ) : (
          <ul className="divide-y divide-white/5" role="radiogroup" aria-label={t('forwardDestination')}>
            {visible.map((channel) => (
              <li key={channel.id} role="none">
                <label
                  className={`flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-200 transition hover:bg-white/5 disabled:opacity-50 ${selectedId === channel.id ? 'bg-primary/20 ring-1 ring-inset ring-primary/40' : ''}`}
                >
                  <input
                    type="radio"
                    name={destinationGroup}
                    checked={selectedId === channel.id}
                    disabled={sending}
                    onChange={() => {
                      setSelectedId(channel.id)
                      setError(null)
                    }}
                  />
                  <span className="text-gray-500">#</span>
                  <span className="flex-1">{channel.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-300" aria-live="polite">
        {selected ? t('forwardSelected', { channel: selected.name }) : t('forwardChooseDestination')}
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={openDestination}
          disabled={sending}
          onChange={(event) => setOpenDestination(event.target.checked)}
        />
        {t('forwardOpenDestination')}
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={sending}
          onClick={close}
          className="min-h-11 rounded px-3 py-1.5 text-sm font-medium text-gray-300 hover:bg-white/10 disabled:opacity-50"
        >
          {t('editCancel')}
        </button>
        <button
          type="button"
          disabled={!selected || sending}
          onClick={() => void send()}
          className="min-h-11 rounded bg-primary px-4 py-1.5 text-sm font-medium text-primary-text disabled:opacity-50"
        >
          {t(sending ? 'messageActionPending' : error ? 'forwardRetry' : 'forwardSend')}
        </button>
      </div>
    </ModalOverlay>
  )
}
