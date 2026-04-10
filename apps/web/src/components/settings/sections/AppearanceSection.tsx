import { ACCENT_OPTIONS } from '@/lib/accent'
import { useSettingsStore } from '@/stores/settings.store'

export function AppearanceSection() {
  const accent = useSettingsStore((s) => s.accent)
  const setAccent = useSettingsStore((s) => s.setAccent)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-base font-semibold text-white">Accent Color</h2>
        <p className="mb-4 text-sm text-gray-400">Choose a color that highlights buttons, links, and active elements.</p>

        <div className="flex flex-wrap gap-3">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setAccent(opt.key)}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                accent === opt.key
                  ? 'ring-2 ring-white/30 bg-white/10 text-white'
                  : 'bg-surface-darkest text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: opt.color }}
              />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-6">
        <h2 className="mb-1 text-base font-semibold text-white">Theme</h2>
        <p className="text-sm text-gray-400">
          Dark mode is the default and only fully supported theme. A light theme is planned for the future.
        </p>
      </div>
    </div>
  )
}
