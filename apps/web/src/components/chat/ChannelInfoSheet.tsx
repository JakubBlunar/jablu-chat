import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import { NotifBellSheetBtn } from '@/components/channel/NotifBellSheetBtn'

interface ChannelInfoSheetProps {
  channelId: string
  pinnedCount: number
  isAdmin: boolean
  onClose: () => void
  onSearch: () => void
  onPinned: () => void
  onSaved: () => void
  onMembers: () => void
  onSettings: () => void
}

export function ChannelInfoSheet({
  channelId,
  pinnedCount,
  isAdmin,
  onClose,
  onSearch,
  onPinned,
  onSaved,
  onMembers,
  onSettings
}: ChannelInfoSheetProps) {
  return (
    <BottomSheet open onClose={onClose}>
      <div className="flex flex-col gap-1.5 px-3">
        <SheetBtn icon={<SearchIcon />} label="Search" onClick={onSearch} />
        <SheetBtn
          icon={<PinIcon />}
          label="Pinned Messages"
          subtitle={pinnedCount > 0 ? `${pinnedCount} pinned` : undefined}
          onClick={onPinned}
        />
        <SheetBtn icon={<BookmarkIcon />} label="Saved Messages" onClick={onSaved} />
        <NotifBellSheetBtn channelId={channelId} onClose={onClose} />
        <SheetBtn icon={<MembersIcon />} label="Members" onClick={onMembers} />
        {isAdmin && (
          <SheetBtn icon={<SettingsIcon />} label="Channel Settings" onClick={onSettings} />
        )}
      </div>
    </BottomSheet>
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

function MembersIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6M23 11h-6" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}
