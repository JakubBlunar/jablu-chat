import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { composerKey, useDraftStore, type ComposerMode } from '@/stores/draft.store'

export function DraftBadge({ mode, contextId }: { mode: ComposerMode; contextId: string }) {
  const { t } = useTranslation('chat')
  const userId = useAuthStore((s) => s.user?.id)
  const hasDraft = useDraftStore((s) => {
    const draft = userId ? s.drafts[composerKey(userId, mode, contextId)] : undefined
    return !!(draft?.text || draft?.reply || draft?.fileCount)
  })
  return hasDraft ? <span className="shrink-0 text-xs font-medium text-primary">{t('draft')}</span> : null
}
