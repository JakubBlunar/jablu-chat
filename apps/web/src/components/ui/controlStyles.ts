/** Shared visual + size tokens for form controls (Input, Textarea, Select, MultiSelect, Button). */
export const controlBase =
  'w-full rounded-md bg-surface-darkest px-3 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-500 focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

export const controlSizes = {
  sm: 'h-8',
  md: 'h-9',
} as const

export type ControlSize = keyof typeof controlSizes

export const fieldLabelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400'
