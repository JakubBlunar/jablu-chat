import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { useInboxStore } from '@/stores/inbox.store'
import { openConversation } from '@/lib/conversationNavigation'
type Panel = typeof import('./InboxPanel').default

export function InboxWorkspace() {
  const userId = useAuthStore((s) => (s.isAuthenticated ? (s.user?.id ?? null) : null))
  const open = useInboxStore((s) => s.open)
  const { t } = useTranslation('common')
  const [PanelContent, setPanelContent] = useState<Panel | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!userId || !open || PanelContent) return
    let active = true
    setFailed(false)
    import('./InboxPanel')
      .then((module) => {
        if (active) setPanelContent(() => module.default)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [userId, open, PanelContent, attempt])

  const readerRequest = useInboxStore((s) => s.reader?.requestId)
  useEffect(() => {
    useInboxStore.getState().syncUser(userId)
    if (userId) void useInboxStore.getState().loadSession()
  }, [userId])
  useEffect(() => {
    const reader = useInboxStore.getState().reader
    if (!reader || reader.group.unavailable) return
    const target = reader.target
    void openConversation({
      target:
        target.mode === 'dm'
          ? { kind: 'dm', conversationId: target.contextId }
          : { kind: 'channel', serverId: target.serverId!, channelId: target.contextId },
      position: target.messageId
        ? { kind: 'message', messageId: target.messageId, threadParentId: target.threadParentId }
        : { kind: 'unread' },
      source: 'inbox'
    })
  }, [readerRequest])
  if (!userId || !open) return null
  if (PanelContent) return <PanelContent />
  return (
    <div role="status" className="fixed right-3 top-14 z-[100] rounded-md bg-surface-raised p-3 shadow-lg">
      {failed ? <button onClick={() => setAttempt((value) => value + 1)}>{t('retry')}</button> : t('loading')}
      <button aria-label={t('close')} className="ml-3" onClick={() => useInboxStore.getState().close()}>
        ×
      </button>
    </div>
  )
}
