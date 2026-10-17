import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type DmConversation } from '@/lib/api'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'
import { useAppNavigate } from '@/hooks/useAppNavigate'

export function ConversationActions({ conversation, onClose }: { conversation: DmConversation; onClose: () => void }) {
  const { t } = useTranslation('chat')
  const { goToFriends } = useAppNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try {
      await action()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }
  const update = (data: { isFavorite?: boolean; muted?: boolean }) =>
    run(async () => {
      useDmStore.getState().addOrUpdateConversation(await api.updateDmPreferences(conversation.id, data))
    })
  return (
    <div className="space-y-2 px-3 pb-3 [&_button]:min-h-11">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          aria-pressed={!!conversation.isFavorite}
          onClick={() => void update({ isFavorite: !conversation.isFavorite })}
          className="rounded bg-white/5 px-2 py-1.5 text-xs text-gray-200 disabled:opacity-50"
        >
          {t(conversation.isFavorite ? 'conversationUnfavorite' : 'conversationFavorite')}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={!!conversation.muted}
          onClick={() => void update({ muted: !conversation.muted })}
          className="rounded bg-white/5 px-2 py-1.5 text-xs text-gray-200 disabled:opacity-50"
        >
          {t(conversation.muted ? 'conversationUnmute' : 'conversationMute')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (!(await useReadStateStore.getState().markDmUnread(conversation.id)))
                throw new Error('Could not mark unread')
              onClose()
              goToFriends()
            })
          }
          className="rounded bg-white/5 px-2 py-1.5 text-xs text-gray-200 disabled:opacity-50"
        >
          {t('conversationMarkUnread')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {t('conversationActionFailed')}
        </p>
      )}
    </div>
  )
}
