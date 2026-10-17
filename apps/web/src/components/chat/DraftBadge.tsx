import { useTranslation } from 'react-i18next'
import { useHasDraft, type ComposerMode } from '@/stores/draft.store'

export function DraftBadge({
  mode,
  contextId,
  threadParentId
}: {
  mode: ComposerMode
  contextId: string
  threadParentId?: string
}) {
  const { t } = useTranslation('chat')
  const hasDraft = useHasDraft(mode, contextId, threadParentId)
  return hasDraft ? <span className="shrink-0 text-xs font-medium text-primary">{t('draft')}</span> : null
}
