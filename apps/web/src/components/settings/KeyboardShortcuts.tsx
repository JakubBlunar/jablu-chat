import { keyboardShortcuts, type Shortcut } from '@/lib/keyboardShortcuts'
import { Kbd } from '@/components/ui/Kbd'
import { useTranslation } from 'react-i18next'

const KEY_LABEL_KEYS: Record<string, string> = {
  Ctrl: 'shortcuts.keys.ctrl',
  Escape: 'shortcuts.keys.escape',
  Enter: 'shortcuts.keys.enter',
  Shift: 'shortcuts.keys.shift',
  Tab: 'shortcuts.keys.tab',
  Space: 'shortcuts.keys.space'
}

function ShortcutRow({ shortcut, t }: { shortcut: Shortcut; t: (key: string) => string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-gray-300">{t(`shortcuts.descriptions.${shortcut.descriptionKey}`)}</span>
      <div className="flex shrink-0 items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-gray-500">+</span>}
            <Kbd>{KEY_LABEL_KEYS[key] ? t(KEY_LABEL_KEYS[key]) : key}</Kbd>
          </span>
        ))}
      </div>
    </div>
  )
}

export function KeyboardShortcutsSection() {
  const { t } = useTranslation('settings')
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/5 bg-surface-darkest/50 px-4 py-3">
        <p className="text-xs text-gray-400">
          {t('shortcuts.tipBefore')}
          <Kbd>{t('shortcuts.keys.ctrl')}</Kbd>
          <span className="mx-0.5 text-[10px] text-gray-500">+</span>
          <Kbd>/</Kbd> {t('shortcuts.tipAfter')}
        </p>
      </div>

      {keyboardShortcuts.map((group) => (
        <div key={group.categoryKey}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {t(`shortcuts.categories.${group.categoryKey}`)}
          </p>
          <div className="divide-y divide-white/5 rounded-lg bg-surface-dark px-4">
            {group.shortcuts.map((shortcut, i) => (
              <ShortcutRow key={i} shortcut={shortcut} t={t} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
