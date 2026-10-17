import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings.store'

export function CollapsiblePreview({ title, children }: { title: string; children: ReactNode }) {
  const compact = useSettingsStore((s) => s.compactPreviews)
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const { t } = useTranslation('chat')
  if (!compact) return children
  return (
    <div className="my-1 max-w-lg overflow-hidden rounded-lg bg-surface-dark ring-1 ring-white/10">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        aria-label={t(expanded ? 'collapsePreview' : 'expandPreview', { name: title })}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-gray-300 hover:bg-white/5"
      >
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
        <span className="min-w-0 truncate">{title}</span>
      </button>
      <div id={id}>{expanded && children}</div>
    </div>
  )
}
