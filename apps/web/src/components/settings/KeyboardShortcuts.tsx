import { keyboardShortcuts, type Shortcut } from '@/lib/keyboardShortcuts'
import { Kbd } from '@/components/ui/Kbd'

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-gray-300">{shortcut.description}</span>
      <div className="flex shrink-0 items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-gray-500">+</span>}
            <Kbd>{key}</Kbd>
          </span>
        ))}
      </div>
    </div>
  )
}

export function KeyboardShortcutsSection() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/5 bg-surface-darkest/50 px-4 py-3">
        <p className="text-xs text-gray-400">
          Tip: Press{' '}
          <Kbd>Ctrl</Kbd>
          <span className="mx-0.5 text-[10px] text-gray-500">+</span>
          <Kbd>/</Kbd>{' '}
          anywhere to open this reference.
        </p>
      </div>

      {keyboardShortcuts.map((group) => (
        <div key={group.category}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {group.category}
          </p>
          <div className="divide-y divide-white/5 rounded-lg bg-surface-dark px-4">
            {group.shortcuts.map((shortcut, i) => (
              <ShortcutRow key={i} shortcut={shortcut} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
