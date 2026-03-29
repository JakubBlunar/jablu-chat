export function SettingsInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  maxLength
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  maxLength?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold tracking-wide text-gray-400">{label.toUpperCase()}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded-md border border-surface-darkest bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus:border-primary"
      />
    </div>
  )
}
