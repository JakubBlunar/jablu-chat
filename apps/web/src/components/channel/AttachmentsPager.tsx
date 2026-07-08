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
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={onPrev}
        className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {t('previous')}
      </button>
      <span className="text-xs text-gray-500">
        {currentPage} / {totalPages}
      </span>
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={onNext}
        className="rounded px-2 py-1 text-xs font-medium text-gray-300 transition hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
      >
        {t('next')}
      </button>
    </div>
  )
}
