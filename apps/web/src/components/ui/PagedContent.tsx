import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { AttachmentsPager } from '@/components/channel/AttachmentsPager'

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
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ items: T[]; total: number }>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    void loadPage(page, PAGE_SIZE).then(
      (result) => {
        if (cancelled) return
        if (page > 0 && result.items.length === 0 && result.total <= page * PAGE_SIZE) {
          setPage(Math.max(0, Math.ceil(result.total / PAGE_SIZE) - 1))
        } else {
          setData(result)
          setLoading(false)
        }
      },
      () => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [loadPage, page, attempt])
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
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 text-primary">
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
      <AttachmentsPager
        page={page}
        pageSize={PAGE_SIZE}
        total={data.total}
        onPrev={() => setPage((n) => Math.max(0, n - 1))}
        onNext={() => setPage((n) => n + 1)}
      />
    </div>
  )
}
