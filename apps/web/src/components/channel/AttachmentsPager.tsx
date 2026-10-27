import { PaginationControls } from '@/components/ui/PaginationControls'
import { useTranslation } from 'react-i18next'

interface AttachmentsPagerProps {
  page: number
  pageSize: number
  total: number
  onPrev: () => void
  onNext: () => void
}

export function AttachmentsPager({ page, pageSize, total, onPrev, onNext }: AttachmentsPagerProps) {
  const { t } = useTranslation('common')
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = page + 1
  if (total <= pageSize) return null

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-surface-dark px-3 py-2">
      <PaginationControls
        page={currentPage}
        pages={totalPages}
        onPrevious={onPrev}
        onNext={onNext}
        previousLabel={t('previous')}
        nextLabel={t('next')}
      />
    </div>
  )
}
