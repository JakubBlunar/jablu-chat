import type { Server } from '@/stores/server.store'
import { GearIcon } from './mobileNavIcons'

export function ServerMenuSheet({
  server,
  isAdminOrOwner,
  isOwner,
  eventCount,
  onClose,
  onServerSettings,
  onReorder,
  onInvite,
  onEvents,
  onLeave
}: {
  server: Server
  isAdminOrOwner: boolean
  isOwner: boolean
  eventCount: number
  onClose: () => void
  onServerSettings: () => void
  onReorder: () => void
  onInvite: () => void
  onEvents: () => void
  onLeave: () => void
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface-dark shadow-2xl ring-1 ring-white/10"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-semibold text-white">{server.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col py-2">
          {isAdminOrOwner && (
            <button
              type="button"
              onClick={onServerSettings}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
            >
              <GearIcon />
              Server Settings
            </button>
          )}
          {isAdminOrOwner && (
            <button
              type="button"
              onClick={onReorder}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z" />
              </svg>
              Reorder Channels
            </button>
          )}
          <button
            type="button"
            onClick={onInvite}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            Invite People
          </button>
          <button
            type="button"
            onClick={onEvents}
            className="flex items-center gap-3 px-4 py-3 text-sm text-gray-200 transition active:bg-white/[0.06]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Events
            {eventCount > 0 && (
              <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {eventCount}
              </span>
            )}
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
                Leave Server
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
