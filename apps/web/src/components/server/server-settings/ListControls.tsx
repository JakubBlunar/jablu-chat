import { Select } from '@/components/ui'
import { PaginationControls } from '@/components/ui/PaginationControls'
import { useTranslation } from 'react-i18next'

// Clamp after deletions; a changed search/filter starts at the first page.
export { useListPage } from '@/hooks/useListPage'

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
        <PaginationControls
          page={page}
          pages={pages}
          onPrevious={() => onPageChange(page - 1)}
          onNext={() => onPageChange(page + 1)}
          previousLabel={t('lists.previous')}
          nextLabel={t('lists.next')}
          previousContent="‹"
          nextContent="›"
          pageLabel={t('lists.page', { page, pages })}
          size="sm"
        />
      </div>
    </nav>
  )
}
