export type AccentPreset = 'amber' | 'teal' | 'coral' | 'indigo' | 'rose' | 'emerald'

const ACCENT_COLORS: Record<AccentPreset, { primary: string; hover: string; text: string }> = {
  amber: { primary: '#f59e0b', hover: '#d97706', text: '#451a03' },
  teal: { primary: '#14b8a6', hover: '#0d9488', text: '#042f2e' },
  coral: { primary: '#f97316', hover: '#ea580c', text: '#431407' },
  indigo: { primary: '#6366f1', hover: '#4f46e5', text: '#ffffff' },
  rose: { primary: '#f43f5e', hover: '#e11d48', text: '#ffffff' },
  emerald: { primary: '#10b981', hover: '#059669', text: '#022c22' }
}

// Text links and solid buttons both need contrast on a pale surface.
const LIGHT_ACCENTS: Record<AccentPreset, { primary: string; hover: string; text: string }> = {
  amber: { primary: '#946000', hover: '#795000', text: '#ffffff' },
  teal: { primary: '#087c72', hover: '#06665e', text: '#ffffff' },
  coral: { primary: '#bd480a', hover: '#9a3907', text: '#ffffff' },
  indigo: { primary: '#4f46e5', hover: '#4338ca', text: '#ffffff' },
  rose: { primary: '#c51e4b', hover: '#a71940', text: '#ffffff' },
  emerald: { primary: '#087f5b', hover: '#066649', text: '#ffffff' }
}

export const ACCENT_OPTIONS: { key: AccentPreset; color: string }[] = [
  { key: 'amber', color: '#f59e0b' },
  { key: 'teal', color: '#14b8a6' },
  { key: 'coral', color: '#f97316' },
  { key: 'indigo', color: '#6366f1' },
  { key: 'rose', color: '#f43f5e' },
  { key: 'emerald', color: '#10b981' }
]

export function applyAccentPreset(preset: AccentPreset) {
  const colors = (document.documentElement.dataset.theme === 'light' ? LIGHT_ACCENTS : ACCENT_COLORS)[preset]
  document.documentElement.style.setProperty('--color-primary', colors.primary)
  document.documentElement.style.setProperty('--color-primary-hover', colors.hover)
  document.documentElement.style.setProperty('--color-primary-text', colors.text)
}
