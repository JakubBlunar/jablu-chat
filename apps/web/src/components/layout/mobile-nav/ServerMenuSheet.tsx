import type { Server } from '@/stores/server.store'
import { GearIcon } from './mobileNavIcons'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '@/components/ui/BottomSheet'

export function ServerMenuSheet({
  server,
  isAdminOrOwner,
  canManageServer,
  isOwner,
  eventCount,
  onClose,
  onServerSettings,
  onEditProfile,
  onLeaderboard,
  onReorder,
  onCreateCategory,
  onMarkAllRead,
  onNotifSettings,
  onInvite,
  onEvents,
  onChangeRoles,
  onLeave
}: {
  server: Server
  isAdminOrOwner: boolean
  canManageServer: boolean
  isOwner: boolean
  eventCount: number
  onClose: () => void
  onServerSettings: () => void
  onEditProfile: () => void
  onLeaderboard: () => void
  onReorder: () => void
  onCreateCategory: () => void
  onMarkAllRead: () => void
  onNotifSettings: () => void
  onInvite: () => void
  onEvents: () => void
  onChangeRoles: () => void
  onLeave: () => void
}) {
  const { t } = useTranslation('nav')
  const { t: tChannels } = useTranslation('channels')
  const { t: tCommon } = useTranslation('common')
  const hasServerActions = isAdminOrOwner || canManageServer
  return (
    <BottomSheet open onClose={onClose} aria-label={server.name} maxHeightDvh={90}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-sm font-semibold text-white">{server.name}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col py-2">
        {hasServerActions && (
          <p className="px-4 py-1 text-xs font-semibold uppercase text-gray-500">{t('serverActions')}</p>
        )}
        {hasServerActions && (
          <button
            type="button"
            onClick={onServerSettings}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <GearIcon />
            {t('serverSettings')}
          </button>
        )}
        {isAdminOrOwner && (
          <button
            type="button"
            onClick={onReorder}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v4zm0-8h18V9H3v2zm0-6v2h18V5H3z" />
            </svg>
            {tChannels('sidebar.reorderChannels')}
          </button>
        )}
        {isAdminOrOwner && (
          <button
            type="button"
            onClick={onCreateCategory}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {tChannels('sidebar.createCategory')}
          </button>
        )}
        {hasServerActions && <div className="mx-4 my-1 border-t border-white/10" />}
        <p className="px-4 py-1 text-xs font-semibold uppercase text-gray-500">{t('personalServerActions')}</p>
        <button
          type="button"
          onClick={onEditProfile}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          {t('profileEdit')}
        </button>
        {server.xpEnabled && (
          <button
            type="button"
            onClick={onLeaderboard}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 21h8M12 17v4M5 4h14v4a7 7 0 11-14 0V4zM5 8a3 3 0 01-3-3V4h3m14 4a3 3 0 003-3V4h-3"
              />
            </svg>
            {t('leaderboard')}
          </button>
        )}
        <button
          type="button"
          onClick={onMarkAllRead}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {tChannels('sidebar.markAllAsRead')}
        </button>
        <button
          type="button"
          onClick={onNotifSettings}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {tChannels('sidebar.notificationSettings')}
        </button>
        <button
          type="button"
          onClick={onInvite}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
          {t('invitePeople')}
        </button>
        <button
          type="button"
          onClick={onEvents}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t('events')}
          {eventCount > 0 && (
            <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {eventCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onChangeRoles}
          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('changeRoles')}
        </button>
        {!isOwner && (
          <>
            <div className="mx-4 my-1 border-t border-white/10" />
            <button
              type="button"
              onClick={onLeave}
              className="flex items-center gap-3 px-4 py-3 text-sm text-red-400 transition active:bg-red-500/20"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5a2 2 0 00-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
              </svg>
              {t('leaveServerTitle')}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
