import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select } from '@/components/ui'

// Clamp after deletions; a changed search/filter starts at the first page.
export function useListPage<T>(items: T[], filterKey: string) {
  const [pageSize, setPageSize] = useState(10)
  const [position, setPosition] = useState({ key: filterKey, page: 1 })
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = position.key === filterKey ? Math.min(position.page, pages) : 1
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages,
    pageSize,
    total: items.length,
    onPageChange: (next: number) => setPosition({ key: filterKey, page: next }),
    onPageSizeChange: (size: number) => {
      setPageSize(size)
      setPosition({ key: filterKey, page: 1 })
    }
  }
}

export function ListPagination({
  page,
  pages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange
}: {
  page: number
  pages: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}) {
  const { t } = useTranslation('server-settings')
  return (
    <nav
      aria-label={t('lists.pagination')}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"
    >
      <p role="status" className="text-xs text-gray-400">
        {t('lists.range', {
          start: total ? (page - 1) * pageSize + 1 : 0,
          end: Math.min(page * pageSize, total),
          total
        })}
      </p>
      <div className="flex items-center gap-2">
        <Select
          size="sm"
          aria-label={t('lists.pageSize')}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {[10, 25, 50].map((size) => (
            <option key={size} value={size}>
              {t('lists.perPage', { count: size })}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          aria-label={t('lists.previous')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </Button>
        <span className="whitespace-nowrap text-xs text-gray-400">{t('lists.page', { page, pages })}</span>
        <Button
          size="sm"
          variant="secondary"
          aria-label={t('lists.next')}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </Button>
      </div>
    </nav>
  )
}
