import { AttachmentsPager } from '@/components/channel/AttachmentsPager'
import { usePagedContent } from '@/hooks/usePagedContent'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'

const PAGE_SIZE = 30
export function PagedContent<T>({
  loadPage,
  emptyLabel,
  children
}: {
  loadPage: (page: number, limit: number) => Promise<{ items: T[]; total: number }>
  emptyLabel: string
  children: (items: T[]) => ReactNode
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const { page, data, loading, error, retry, previous, next } = usePagedContent(loadPage, PAGE_SIZE)

  if (loading)
    return (
      <p role="status" className="px-3 py-8 text-center text-sm text-gray-400">
        {tCommon('loading')}
      </p>
    )
  if (error)
    return (
      <div role="alert" className="px-3 py-8 text-center text-sm text-gray-400">
        <p>{t('conversationLoadFailed')}</p>
        <button type="button" onClick={retry} className="mt-2 text-primary">
          {t('conversationRetry')}
        </button>
      </div>
    )
  if (data.total === 0) return <p className="px-3 py-8 text-center text-sm text-gray-400">{emptyLabel}</p>
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SimpleBar className="min-h-0 flex-1" style={{ maxHeight: '100%' }}>
        {children(data.items)}
      </SimpleBar>
      <AttachmentsPager page={page} pageSize={PAGE_SIZE} total={data.total} onPrev={previous} onNext={next} />
    </div>
  )
}
