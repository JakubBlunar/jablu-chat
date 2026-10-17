import { useTranslation } from 'react-i18next'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { resolveMediaUrl } from '@/lib/api'
import { getDmDisplayInfo } from '@/lib/dmDisplay'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useReadStateStore } from '@/stores/readState.store'

export function UnreadDmShortcuts({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('nav')
  const { goToDm } = useAppNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const conversations = useDmStore((s) => s.conversations)
  const readStates = useReadStateStore((s) => s.dms)

  return conversations
    .filter((conversation) => !conversation.muted && (readStates.get(conversation.id)?.unreadCount ?? 0) > 0)
    .map((conversation) => {
      const count = readStates.get(conversation.id)!.unreadCount
      const { name, avatarUrl } = getDmDisplayInfo(conversation, userId)
      const label = t('unreadDm', { name, count })
      return (
        <div key={conversation.id} className="relative">
          <button
            type="button"
            title={label}
            aria-label={label}
            onClick={() => {
              goToDm(conversation.id)
              onNavigate?.()
            }}
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[24px] bg-primary text-sm font-semibold text-primary-text transition-all hover:rounded-2xl"
          >
            {avatarUrl ? (
              <img src={resolveMediaUrl(avatarUrl)} alt="" className="h-full w-full object-cover" />
            ) : (
              name.trim().charAt(0).toUpperCase() || '?'
            )}
          </button>
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface-darkest bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
          >
            {count > 99 ? '99+' : count}
          </span>
        </div>
      )
    })
}
