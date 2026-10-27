import { Toggle } from '@/components/ui/Toggle'

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  layout = 'card'
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  layout?: 'card' | 'inline'
}) {
  const toggle = (
    <Toggle
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(next) => {
        if (!disabled) onChange(next)
      }}
    />
  )
  const content =
    layout === 'inline' ? (
      <span>
        <span className="block text-sm text-gray-200">{label}</span>
        {description && <span className="block text-xs text-gray-500">{description}</span>}
      </span>
    ) : (
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-gray-400">{description}</p>}
      </div>
    )
  if (layout === 'inline')
    return (
      <label className={'flex cursor-pointer items-center gap-3 ' + (disabled ? 'opacity-60' : '')}>
        {toggle}
        {content}
      </label>
    )
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-dark px-4 py-3">
      {content}
      {toggle}
    </div>
  )
}
