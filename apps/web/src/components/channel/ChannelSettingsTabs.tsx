import { useId } from 'react'

export function ChannelSettingsTabs<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: { value: T; label: string; panelId?: string }[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
      {options.map((option, index) => (
        <button
          key={option.value}
          id={`${id}-${option.value}`}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          aria-controls={value === option.value ? option.panelId : undefined}
          tabIndex={value === option.value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            let next: number
            if (event.key === 'ArrowRight') next = (index + 1) % options.length
            else if (event.key === 'ArrowLeft') next = (index + options.length - 1) % options.length
            else if (event.key === 'Home') next = 0
            else if (event.key === 'End') next = options.length - 1
            else return
            event.preventDefault()
            onChange(options[next].value)
            document.getElementById(`${id}-${options[next].value}`)?.focus()
          }}
          className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition ${value === option.value ? 'bg-primary/20 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
