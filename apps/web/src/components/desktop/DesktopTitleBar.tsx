import { InAppNotificationBell } from '@/components/notifications/InAppNotificationBell'
import { SavedMessagesBell } from '@/components/chat/SavedMessagesBell'
import { useNavHistory } from '@/hooks/useNavHistory'
import { useSideButtonNavigation } from '@/hooks/useSideButtonNavigation'
import { useTaskbarAttention } from '@/hooks/useTaskbarAttention'
import { useToolbarTitle } from '@/hooks/useToolbarTitle'
import { useAuthStore } from '@/stores/auth.store'

function ChevronLeft() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

/**
 * Custom frameless title bar for the desktop app, integrated with
 * tauri-plugin-frame. The plugin injects a transparent, full-width drag region
 * plus the minimize/maximize/close controls at the top-right (z-index 100) and
 * exposes `--tauri-frame-controls-width`. To end up with a single unified bar we
 * layer around it:
 *   - a colored background BELOW the plugin (z-90) so the caption buttons paint
 *     on our bar,
 *   - our interactive row ABOVE the plugin's drag region (z-110), with empty
 *     areas set to `pointer-events: none` so the plugin still handles dragging
 *     and the caption buttons stay clickable, and controls opting back in.
 * The right padding reserves space for the plugin's caption buttons.
 */
export function DesktopTitleBar() {
  const nav = useNavHistory()
  const { serverName, channelName, dmName, isDm } = useToolbarTitle()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  useSideButtonNavigation(nav)
  useTaskbarAttention()

  return (
    <div className="relative h-8 shrink-0 select-none text-xs text-gray-300">
      {/* Colored bar, painted behind the plugin's transparent caption controls. */}
      <div className="absolute inset-0 z-[90] border-b border-black/30 bg-surface-darkest" aria-hidden />

      {/* Interactive row, above the plugin's drag region. Empty space stays
          click-through so the plugin can drag the window and expose its controls. */}
      <div
        className="absolute inset-0 z-[110] flex items-center gap-1 pl-1.5"
        style={{ paddingRight: 'var(--tauri-frame-controls-width, 138px)', pointerEvents: 'none' }}
      >
        <button
          type="button"
          aria-label="Back"
          title="Back"
          disabled={!nav.canGoBack}
          onClick={nav.goBack}
          style={{ pointerEvents: 'auto' }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft />
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward"
          disabled={!nav.canGoForward}
          onClick={nav.goForward}
          style={{ pointerEvents: 'auto' }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight />
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2">
          {isDm ? (
            <span className="truncate font-medium text-gray-200">{dmName ?? 'Direct Messages'}</span>
          ) : serverName ? (
            <>
              <span className="truncate font-semibold text-white">{serverName}</span>
              {channelName && (
                <>
                  <span className="text-gray-600">/</span>
                  <span className="truncate text-gray-300">#{channelName}</span>
                </>
              )}
            </>
          ) : (
            <span className="font-medium text-gray-400">Jablu</span>
          )}
        </div>

        {isAuthenticated && (
          <span style={{ pointerEvents: 'auto' }} className="flex shrink-0 items-center">
            <SavedMessagesBell size="sm" />
            <InAppNotificationBell size="sm" className="mr-1" />
          </span>
        )}
      </div>
    </div>
  )
}
