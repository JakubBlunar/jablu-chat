import { useCallback, useEffect, useState } from 'react'
import SimpleBar from 'simplebar-react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { type ScreenShareOptions, publishScreenShare } from './screenShareUtils'
import { useSettingsStore } from '@/stores/settings.store'

type ScreenSource = {
  id: string
  name: string
  thumbnail: string
  appIcon: string | null
}

const RESOLUTION_OPTIONS = ['720p', '1080p', 'native'] as const
const FPS_OPTIONS = [5, 15, 20, 30] as const

export function ScreenSharePicker() {
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [open, setOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [resolution, setResolution] = useState<ScreenShareOptions['resolution']>(() =>
    useSettingsStore.getState().screenShareResolution
  )
  const [fps, setFps] = useState<ScreenShareOptions['fps']>(() => useSettingsStore.getState().screenShareFps)

  useEffect(() => {
    function handleEvent(e: Event) {
      const detail = (e as CustomEvent<{ sources: ScreenSource[] }>).detail
      setSources(detail.sources)
      setSelectedSource(null)
      const s = useSettingsStore.getState()
      setResolution(s.screenShareResolution)
      setFps(s.screenShareFps)
      setOpen(true)
    }
    window.addEventListener('voice:pick-screen', handleEvent)
    return () => window.removeEventListener('voice:pick-screen', handleEvent)
  }, [])

  const setScreenShareResolution = useSettingsStore((st) => st.setScreenShareResolution)
  const setScreenShareFps = useSettingsStore((st) => st.setScreenShareFps)

  const handleStart = useCallback(() => {
    if (!selectedSource) return
    setScreenShareResolution(resolution)
    setScreenShareFps(fps)
    setOpen(false)
    void publishScreenShare(selectedSource, { resolution, fps })
  }, [selectedSource, resolution, fps, setScreenShareResolution, setScreenShareFps])

  if (!open || sources.length === 0) return null

  const screens = sources.filter((s) => s.id.startsWith('screen:'))
  const windows = sources.filter((s) => s.id.startsWith('window:'))

  return (
    <ModalOverlay onClose={() => setOpen(false)} zIndex="z-[200]" maxWidth="max-w-4xl" noPadding>
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Share Your Screen</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        {/* Source selection */}
        <SimpleBar className="max-h-[400px] px-6 py-4">
          {screens.length > 0 && (
            <>
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Screens</h3>
              <div className="mb-4 grid grid-cols-3 gap-3">
                {screens.map((s) => (
                  <SourceCard key={s.id} source={s} selected={selectedSource === s.id} onSelect={setSelectedSource} />
                ))}
              </div>
            </>
          )}

          {windows.length > 0 && (
            <>
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Application Windows</h3>
              <div className="grid grid-cols-3 gap-3">
                {windows.map((s) => (
                  <SourceCard key={s.id} source={s} selected={selectedSource === s.id} onSelect={setSelectedSource} />
                ))}
              </div>
            </>
          )}
        </SimpleBar>

        {/* Quality options + Start button */}
        <div className="flex items-center gap-6 border-t border-white/5 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">Resolution</span>
            <div className="flex gap-1">
              {RESOLUTION_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setResolution(r)
                    setScreenShareResolution(r)
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    resolution === r ? 'bg-primary text-primary-text' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {r === 'native' ? 'Native' : r}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">FPS</span>
            <div className="flex gap-1">
              {FPS_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFps(f)
                    setScreenShareFps(f)
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    fps === f ? 'bg-primary text-primary-text' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="ml-auto">
            <button
              type="button"
              disabled={!selectedSource}
              onClick={handleStart}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              Start Sharing
            </button>
          </div>
        </div>
    </ModalOverlay>
  )
}

function SourceCard({
  source,
  selected,
  onSelect
}: {
  source: ScreenSource
  selected: boolean
  onSelect: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(source.id)}
      className={`group overflow-hidden rounded-lg border-2 bg-surface-darkest transition ${
        selected ? 'border-primary' : 'border-transparent hover:border-primary/50'
      }`}
    >
      <div className="aspect-video w-full overflow-hidden bg-black">
        <img src={source.thumbnail} alt={source.name} className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {source.appIcon && <img src={source.appIcon} alt="" className="h-4 w-4" />}
        <span className={`truncate text-xs ${selected ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
          {source.name}
        </span>
      </div>
    </button>
  )
}
