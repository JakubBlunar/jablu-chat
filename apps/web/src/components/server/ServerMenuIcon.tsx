import {
  GearIcon,
  InviteIcon,
  LeaveIcon,
  PlusSmallIcon,
  ReorderIcon
} from '@/components/channel/channel-sidebar/sidebarIcons'

const existingIcons = {
  settings: GearIcon,
  invite: InviteIcon,
  leave: LeaveIcon,
  createChannel: PlusSmallIcon,
  createCategory: PlusSmallIcon,
  reorder: ReorderIcon
}

const paths = {
  read: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  profile: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M13 7a4 4 0 11-8 0 4 4 0 018 0zM16 4l2-2 4 4-2 2-4-4zm0 0l-3 7 7-3',
  notifications: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  events: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  roles:
    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  leaderboard: 'M8 21h8M12 17v4M5 4h14v4a7 7 0 11-14 0V4zM5 8a3 3 0 01-3-3V4h3m14 4a3 3 0 003-3V4h-3'
}

export type ServerMenuAction = keyof typeof existingIcons | keyof typeof paths

export function ServerMenuIcon({ action }: { action: ServerMenuAction }) {
  if (action in existingIcons) {
    const Icon = existingIcons[action as keyof typeof existingIcons]
    return (
      <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
        <Icon />
      </span>
    )
  }
  return (
    <svg
      aria-hidden
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[action as keyof typeof paths]} />
    </svg>
  )
}
