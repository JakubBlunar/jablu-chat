import { create } from 'zustand'

export type AccentPreset = 'amber' | 'teal' | 'coral' | 'indigo' | 'rose' | 'emerald'

const ACCENT_COLORS: Record<AccentPreset, { primary: string; hover: string }> = {
  amber:   { primary: '#f59e0b', hover: '#d97706' },
  teal:    { primary: '#14b8a6', hover: '#0d9488' },
  coral:   { primary: '#f97316', hover: '#ea580c' },
  indigo:  { primary: '#6366f1', hover: '#4f46e5' },
  rose:    { primary: '#f43f5e', hover: '#e11d48' },
  emerald: { primary: '#10b981', hover: '#059669' }
}

export const ACCENT_OPTIONS: { key: AccentPreset; label: string; color: string }[] = [
  { key: 'amber', label: 'Amber', color: '#f59e0b' },
  { key: 'teal', label: 'Teal', color: '#14b8a6' },
  { key: 'coral', label: 'Coral', color: '#f97316' },
  { key: 'indigo', label: 'Indigo', color: '#6366f1' },
  { key: 'rose', label: 'Rose', color: '#f43f5e' },
  { key: 'emerald', label: 'Emerald', color: '#10b981' }
]

const THEME_KEY = 'jablu-accent'

function loadAccent(): AccentPreset {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v && v in ACCENT_COLORS) return v as AccentPreset
  } catch {}
  return 'amber'
}

function applyAccent(preset: AccentPreset) {
  const colors = ACCENT_COLORS[preset]
  document.documentElement.style.setProperty('--color-primary', colors.primary)
  document.documentElement.style.setProperty('--color-primary-hover', colors.hover)
}

type ThemeState = {
  accent: AccentPreset
  setAccent: (preset: AccentPreset) => void
}

export const useThemeStore = create<ThemeState>((set) => {
  const initial = loadAccent()
  if (initial !== 'amber') applyAccent(initial)

  return {
    accent: initial,
    setAccent: (preset) => {
      applyAccent(preset)
      try { localStorage.setItem(THEME_KEY, preset) } catch {}
      set({ accent: preset })
    }
  }
})
