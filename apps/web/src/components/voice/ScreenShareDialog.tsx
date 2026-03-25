import { useState } from 'react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { isElectron } from '@/lib/electron'

export type ScreenShareSettings = {
  resolution: '720p' | '1080p' | 'native'
  fps: 5 | 15 | 20 | 30
  audio: boolean
}

const RESOLUTION_OPTIONS = ['720p', '1080p', 'native'] as const
const FPS_OPTIONS = [5, 15, 20, 30] as const

export function ScreenShareDialog({
  onConfirm,
  onClose
}: {
  onConfirm: (settings: ScreenShareSettings) => void
  onClose: () => void
}) {
  const [resolution, setResolution] = useState<ScreenShareSettings['resolution']>('1080p')
  const [fps, setFps] = useState<ScreenShareSettings['fps']>(30)
  const [audio, setAudio] = useState(false)

  const supportsAudio = !isElectron || /win|linux/i.test(navigator.userAgent)

  return (
    <ModalOverlay onClose={onClose} zIndex="z-[200]" noPadding>
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Screen Share Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Resolution</h3>
            <div className="flex gap-2">
              {RESOLUTION_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setResolution(r)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition ${
                    resolution === r ? 'bg-primary text-white' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Frame Rate</h3>
            <div className="flex gap-2">
              {FPS_OPTIONS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFps(f)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    fps === f ? 'bg-primary text-white' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {f} fps
                </button>
              ))}
            </div>
          </div>

          {supportsAudio && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Audio</h3>
              <button
                type="button"
                onClick={() => setAudio(!audio)}
                className="flex w-full items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
              >
                <div
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${audio ? 'bg-primary' : 'bg-white/10'}`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      audio ? 'translate-x-5' : ''
                    }`}
                  />
                </div>
                <div className="text-left">
                  <span className="block text-sm text-gray-200">Include audio</span>
                  <span className="block text-[11px] text-gray-500">Share system or tab audio alongside your screen</span>
                </div>
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ resolution, fps, audio })}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Share Screen
          </button>
        </div>
    </ModalOverlay>
  )
}
