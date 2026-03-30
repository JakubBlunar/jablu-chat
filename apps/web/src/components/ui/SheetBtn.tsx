interface SheetBtnProps {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onClick: () => void
  danger?: boolean
}

export function SheetBtn({ icon, label, subtitle, onClick, danger }: SheetBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition active:brightness-125 ${danger ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-gray-200'}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {subtitle && (
          <span className="block truncate text-xs text-gray-500">{subtitle}</span>
        )}
      </span>
    </button>
  )
}
