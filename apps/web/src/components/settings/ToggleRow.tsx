import { Toggle } from '@/components/ui/Toggle'

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled
}: {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-dark px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <Toggle
        checked={checked}
        disabled={disabled}
        onChange={() => {
          if (!disabled) onChange()
        }}
      />
    </div>
  )
}
