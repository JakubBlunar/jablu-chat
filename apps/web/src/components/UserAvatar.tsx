import { memo } from 'react'
import type { UserStatus } from '@chat/shared'
import { statusColors } from '@/components/ui/StatusDot'
import { hashUsernameToHue } from '@/lib/username-color'
import { resolveMediaUrl } from '@/lib/api'

const sizeMap = {
  sm: 'h-6 w-6 min-h-6 min-w-6 text-xs',
  md: 'h-8 w-8 min-h-8 min-w-8 text-sm',
  lg: 'h-10 w-10 min-h-10 min-w-10 text-base',
  xl: 'h-20 w-20 min-h-20 min-w-20 text-2xl'
} as const

export type UserAvatarProps = {
  username: string
  avatarUrl?: string | null
  size?: keyof typeof sizeMap
  showStatus?: boolean
  status?: UserStatus
}

export const UserAvatar = memo(function UserAvatar({
  username,
  avatarUrl,
  size = 'md',
  showStatus = false,
  status = 'offline'
}: UserAvatarProps) {
  const hue = hashUsernameToHue(username)
  const letter = username.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className={`relative shrink-0 rounded-full ${sizeMap[size]}`} title={username}>
      {avatarUrl ? (
        <img src={resolveMediaUrl(avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-semibold text-white"
          style={{ backgroundColor: `hsl(${hue} 45% 42%)` }}
        >
          {letter}
        </div>
      )}
      {showStatus ? (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-[2px] border-surface-dark ${statusColors[status ?? 'offline']}`}
          aria-hidden
        />
      ) : null}
    </div>
  )
})
