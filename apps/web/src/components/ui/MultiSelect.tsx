import type { ReactNode } from 'react'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { cn } from '@/lib/cn'
import { controlSizes, fieldLabelClass, type ControlSize } from './controlStyles'
import { ColorDot } from './ColorDot'

export type MultiSelectOption = {
  value: string
  label: string
  color?: string | null
}

export type MultiSelectProps = {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  size?: ControlSize
  /** Field label rendered above the trigger. */
  label?: string
  /** Text shown inside the trigger button (defaults to the label or "Select"). */
  buttonLabel?: string
  /** Optional leading icon inside the trigger. */
  icon?: ReactNode
  fullWidth?: boolean
  disabled?: boolean
  id?: string
  className?: string
}

const triggerBase =
  'inline-flex items-center gap-1.5 rounded-md bg-surface-darkest px-3 text-sm text-white ring-1 ring-white/10 transition focus:outline-none data-[focus]:ring-2 data-[focus]:ring-primary disabled:cursor-not-allowed disabled:opacity-50'

export function MultiSelect({
  options,
  value,
  onChange,
  size = 'md',
  label,
  buttonLabel,
  icon,
  fullWidth = false,
  disabled,
  id,
  className,
}: MultiSelectProps) {
  const selectedCount = value.length
  const triggerText = buttonLabel ?? label ?? 'Select'

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      {label && (
        <label htmlFor={id} className={fieldLabelClass}>
          {label}
        </label>
      )}
      <Listbox value={value} onChange={onChange} multiple disabled={disabled}>
        <ListboxButton
          id={id}
          className={cn(triggerBase, controlSizes[size], fullWidth && 'w-full justify-between', className)}
        >
          {icon}
          <span className="truncate">{triggerText}</span>
          {selectedCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
              {selectedCount}
            </span>
          )}
          <svg
            className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </ListboxButton>
        <ListboxOptions
          anchor="bottom end"
          className="z-[200] mt-1 max-h-[60vh] w-[220px] overflow-y-auto rounded-lg bg-surface-darkest py-1 shadow-xl ring-1 ring-white/10 [--anchor-gap:4px] focus:outline-none"
        >
          {options.map((opt) => (
            <ListboxOption
              key={opt.value}
              value={opt.value}
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-300 transition data-[focus]:bg-white/5"
            >
              {({ selected }) => (
                <>
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      selected ? 'border-primary bg-primary' : 'border-gray-600'
                    )}
                  >
                    {selected && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <ColorDot color={opt.color} size="sm" />
                  <span className={cn('truncate', selected ? 'text-white' : 'text-gray-400')}>{opt.label}</span>
                </>
              )}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  )
}
