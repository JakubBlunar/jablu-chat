import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { useOutboxStore } from '@/stores/outbox.store'
import type { ComposerMode } from '@/stores/draft.store'

export function OutboxMessages({
  mode,
  contextId,
  threadParentId
}: {
  mode: ComposerMode
  contextId: string
  threadParentId?: string
}) {
  const { t } = useTranslation('chat')
  const userId = useAuthStore((s) => s.user?.id)
  const items = useOutboxStore((s) => s.items)
  const error = useOutboxStore((s) => s.error)
  const pending = items.filter(
    (item) =>
      item.userId === userId &&
      item.mode === mode &&
      item.contextId === contextId &&
      item.threadParentId === threadParentId
  )
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      console.error('Failed to update queued message', error)
      useOutboxStore.setState({ error: 'outboxStorageFailed' })
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {t(error)}
        </p>
      )}
      {pending.length > 0 && (
        <ul aria-label={t('outboxTitle')} className="mb-2 max-h-40 space-y-2 overflow-y-auto">
          {pending.map((item) => (
            <li key={item.id} className="rounded-lg border border-white/10 bg-surface-dark px-3 py-2 text-sm">
              <p className="line-clamp-2 whitespace-pre-wrap break-words text-gray-200">
                {item.content || t('conversationAttachment')}
              </p>
              {item.files.length > 0 && (
                <p className="truncate text-xs text-gray-400">{item.files.map((file) => file.name).join(', ')}</p>
              )}
              <div className="flex items-center gap-2">
                <span
                  role="status"
                  className={`min-w-0 flex-1 text-xs ${item.status === 'failed' ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {t(`outbox_${item.status}`)}
                </span>
                {item.status === 'failed' && (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-primary"
                    onClick={() => void run(() => useOutboxStore.getState().retry(item.id))}
                  >
                    {t('conversationRetry')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={item.status === 'sending'}
                  className="min-h-11 px-2 text-gray-400 disabled:opacity-40"
                  onClick={() => void run(() => useOutboxStore.getState().discard(item.id))}
                >
                  {t('outboxDiscard')}
                </button>
              </div>
              {item.status === 'failed' && item.error && (
                <p role="alert" className="text-xs text-red-400">
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
