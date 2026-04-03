import { BottomSheet } from '@/components/ui/BottomSheet'
import { SheetBtn } from '@/components/ui/SheetBtn'
import {
  BookmarkIcon,
  MembersIcon,
  PinnedListIcon,
  SearchIcon,
  SettingsCogIcon,
} from '@/components/chat/chatIcons'
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
          icon={<PinnedListIcon />}
          label="Pinned Messages"
          subtitle={pinnedCount > 0 ? `${pinnedCount} pinned` : undefined}
          onClick={onPinned}
        />
        <SheetBtn icon={<BookmarkIcon className="h-5 w-5" />} label="Saved Messages" onClick={onSaved} />
        <NotifBellSheetBtn channelId={channelId} onClose={onClose} />
        <SheetBtn icon={<MembersIcon />} label="Members" onClick={onMembers} />
        {isAdmin && (
          <SheetBtn icon={<SettingsCogIcon />} label="Channel Settings" onClick={onSettings} />
        )}
      </div>
    </BottomSheet>
  )
}
