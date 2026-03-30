import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'

interface DmInfoSheetProps {
  hasProfile: boolean
  onClose: () => void
  onProfile: () => void
  onPinned: () => void
  onSaved: () => void
  onSearch: () => void
}

export function DmInfoSheet({ hasProfile, onClose, onProfile, onPinned, onSaved, onSearch }: DmInfoSheetProps) {
  return (
    <BottomSheet open onClose={onClose}>
      <div className="flex flex-col gap-1.5 px-3">
        {hasProfile && (
          <SheetBtn icon={<UserIcon />} label="User Profile" onClick={onProfile} />
        )}
        <SheetBtn icon={<PinIcon />} label="Pinned Messages" onClick={onPinned} />
        <SheetBtn icon={<BookmarkIcon />} label="Saved Messages" onClick={onSaved} />
        <SheetBtn icon={<SearchIcon />} label="Search" onClick={onSearch} />
      </div>
    </BottomSheet>
  )
}

function UserIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v8m0 0-3-3m3 3 3-3M9 17h6m-6 0v4m6-4v4M5 12h14" />
    </svg>
  )
}

function BookmarkIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}
