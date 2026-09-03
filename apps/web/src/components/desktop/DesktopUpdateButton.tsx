import { useDesktopUpdateStore } from '@/stores/desktopUpdate.store'

function ArrowPathIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  )
}

/**
 * Discord-style title-bar update control. Hidden until an update is in flight
 * or ready; clicking the green arrow installs and relaunches.
 */
export function DesktopUpdateButton() {
  const state = useDesktopUpdateStore((s) => s.state)
  const installing = useDesktopUpdateStore((s) => s.installing)
  const install = useDesktopUpdateStore((s) => s.install)

  const ready = state.status === 'ready'
  const downloading = state.status === 'available' || state.status === 'downloading'
  if (!ready && !downloading) return null

  const version = ready || downloading ? state.version : ''
  const percent = state.status === 'downloading' ? Math.round(state.percent) : null
  const title = ready
    ? `Update ${version} ready — click to restart`
    : percent !== null
      ? `Downloading update ${version}… ${percent}%`
      : `Downloading update ${version}…`

  return (
    <button
      type="button"
      aria-label={ready ? `Restart to install version ${version}` : 'Downloading update'}
      title={title}
      disabled={!ready || installing}
      onClick={() => {
        if (ready) void install()
      }}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
        ready
          ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-300'
          : 'text-gray-400'
      } disabled:cursor-default`}
    >
      <ArrowPathIcon className={`h-[18px] w-[18px] ${downloading ? 'animate-spin' : ''}`} />
      {ready && (
        <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
      )}
    </button>
  )
}
