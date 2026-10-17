import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { OutboxActionError, useOutboxStore } from '@/stores/outbox.store'
import { composerKey, useDraftStore, type ComposerMode } from '@/stores/draft.store'
import { formatBytes } from '@/lib/format-bytes'
import { useState } from 'react'

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
  const progress = useOutboxStore((s) => s.progress)
  const editingId = useDraftStore((s) => s.drafts[composerKey(userId ?? '', mode, contextId, threadParentId)]?.outboxId)
  const [busy, setBusy] = useState<string | null>(null)
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
      useOutboxStore.setState({ error: error instanceof OutboxActionError ? error.message : 'outboxStorageFailed' })
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
              {item.status === 'sending' && progress[item.id] && (
                <div className="text-xs text-gray-300">
                  {progress[item.id].fileIndex < item.files.length ? (
                    <>
                      <p>
                        {t('outboxUploading', { index: progress[item.id].fileIndex + 1, count: item.files.length })} —{' '}
                        {item.files[progress[item.id].fileIndex]?.name}
                      </p>
                      <progress
                        className="w-full accent-primary"
                        aria-label={t('outboxUploading', {
                          index: progress[item.id].fileIndex + 1,
                          count: item.files.length
                        })}
                        value={progress[item.id].loaded}
                        max={Math.max(1, progress[item.id].total)}
                      />
                      <p>
                        {formatBytes(progress[item.id].loaded)} / {formatBytes(progress[item.id].total)}
                      </p>
                    </>
                  ) : (
                    <p>{t('outboxConfirming')}</p>
                  )}
                </div>
              )}
              {editingId === item.id && <p className="text-xs text-primary">{t('outboxEditing')}</p>}
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
                    disabled={editingId === item.id}
                    className="min-h-11 px-2 text-primary"
                    onClick={() => void run(() => useOutboxStore.getState().retry(item.id))}
                  >
                    {t('conversationRetry')}
                  </button>
                )}
                {item.status === 'failed' && editingId !== item.id && (
                  <button
                    type="button"
                    disabled={busy === item.id}
                    className="min-h-11 px-2 text-primary disabled:opacity-40"
                    onClick={() => {
                      setBusy(item.id)
                      void run(() => useOutboxStore.getState().restore(item.id)).finally(() => setBusy(null))
                    }}
                  >
                    {t('outboxRestore')}
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
