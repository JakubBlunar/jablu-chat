import { useTranslation } from 'react-i18next'
import { getDevicePlatform } from '@/lib/platform'
import { Kbd } from '@/components/ui/Kbd'

export function CommandPaletteButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('nav')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="mx-2 my-1 flex min-h-10 items-center gap-2 rounded-lg bg-white/5 px-3 text-left text-sm text-gray-300 transition hover:bg-white/10 hover:text-white"
    >
      <span aria-hidden="true" className="font-mono text-primary">
        &gt;_
      </span>
      <span className="min-w-0 flex-1 truncate">{t('commandPalette')}</span>
      <Kbd>{getDevicePlatform() === 'macos' ? '⌘ K' : 'Ctrl K'}</Kbd>
    </button>
  )
}
