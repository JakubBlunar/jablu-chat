import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { formatSmartTimestamp } from '@/lib/format-time'
import { PagedContent } from '@/components/ui/PagedContent'

export function ConversationLinksList({
  conversationId,
  onJump
}: {
  conversationId: string
  onJump: (id: string) => void
}) {
  const { t } = useTranslation('chat')
  const loadPage = useCallback(
    (page: number, limit: number) => api.getDmLinks(conversationId, page, limit),
    [conversationId]
  )
  return (
    <PagedContent key={conversationId} loadPage={loadPage} emptyLabel={t('conversationLinksEmpty')}>
      {(items) => (
        <div className="divide-y divide-white/5">
          {items.map((message) => (
            <div key={message.messageId} className="space-y-2 px-3 py-3">
              {message.links.length === 0 && <p className="text-xs text-gray-400">{t('conversationLinksInvalid')}</p>}
              {message.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg bg-white/5 px-3 py-2 transition hover:bg-white/10"
                >
                  <span className="block truncate text-xs text-gray-400">{new URL(link.url).hostname}</span>
                  <span className="block truncate text-sm font-medium text-blue-400">{link.title ?? link.url}</span>
                  {link.description && (
                    <span className="mt-1 line-clamp-2 block text-xs text-gray-400">{link.description}</span>
                  )}
                </a>
              ))}
              <p className="truncate text-xs text-gray-500">
                {message.authorName ?? t('deletedUser')} &middot; {formatSmartTimestamp(message.createdAt)}
              </p>
              <button
                type="button"
                onClick={() => onJump(message.messageId)}
                className="text-xs text-primary hover:underline"
              >
                {t('jumpToMessage')}
              </button>
            </div>
          ))}
        </div>
      )}
    </PagedContent>
  )
}
