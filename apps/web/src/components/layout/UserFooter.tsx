import type { ReactNode } from 'react'
import { UserAvatar } from '@/components/UserAvatar'
import { IconButton } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'

function GearIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 00-.49-.42h-3.84a.5.5 0 00-.49.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.74 8.87c-.17.29-.11.67.19.86l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.17.29.49.38.78.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54a.5.5 0 00.49.42h3.84c.24 0 .45-.17.49-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.29.15.62.06.78-.22l1.92-3.32c.17-.29.11-.67-.19-.86l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z" />
    </svg>
  )
}

type UserFooterProps = {
  onOpenSettings: (tab?: string) => void
  className?: string
  children?: ReactNode
}

export function UserFooter({ onOpenSettings, className, children }: UserFooterProps) {
  const user = useAuthStore((s) => s.user)

  return (
    <div className={`flex shrink-0 items-center gap-2 bg-surface-overlay ${className ?? ''}`}>
      <button type="button" onClick={() => onOpenSettings('status')} className="shrink-0 rounded-full transition hover:opacity-80">
        <UserAvatar
          username={user?.username ?? 'User'}
          avatarUrl={user?.avatarUrl}
          size="md"
          showStatus
          status={user?.status ?? 'online'}
        />
      </button>
      <button type="button" onClick={() => onOpenSettings('profile')} className="min-w-0 flex-1 text-left transition hover:opacity-80">
        <p className="truncate text-sm font-semibold text-white">
          {user?.displayName ?? user?.username ?? '…'}
        </p>
        <p className="truncate text-xs text-gray-400">
          {user?.customStatus || <span className="capitalize">{user?.status ?? 'online'}</span>}
        </p>
      </button>
      {children}
      <IconButton label="User settings" onClick={() => onOpenSettings()}>
        <GearIcon />
      </IconButton>
    </div>
  )
}
