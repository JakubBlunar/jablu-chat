import { useState } from 'react'
import {
  type CameraQuality,
  CAMERA_PRESETS,
  getSavedCameraQuality,
  setSavedCameraQuality,
  getSavedBlurEnabled,
  setSavedBlurEnabled
} from '@/lib/deviceSettings'

type Props = {
  mode: 'start' | 'edit'
  onConfirm: (quality: CameraQuality, blur: boolean) => void
  onClose: () => void
}

const QUALITY_OPTIONS = Object.keys(CAMERA_PRESETS) as CameraQuality[]

export function CameraSettingsModal({ mode, onConfirm, onClose }: Props) {
  const [quality, setQuality] = useState<CameraQuality>(getSavedCameraQuality)
  const [blur, setBlur] = useState(getSavedBlurEnabled)

  function handleConfirm() {
    setSavedCameraQuality(quality)
    setSavedBlurEnabled(blur)
    onConfirm(quality, blur)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface-dark shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'start' ? 'Camera Settings' : 'Change Camera Settings'}
          </h2>
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
              {QUALITY_OPTIONS.map((q) => {
                const preset = CAMERA_PRESETS[q]
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                      quality === q ? 'bg-primary text-white' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <span className="block">{q}</span>
                    <span className="block text-[10px] opacity-60">
                      {preset.width}x{preset.height}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">Background Blur</h3>
            <button
              type="button"
              onClick={() => setBlur(!blur)}
              className="flex w-full items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
            >
              <div
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${blur ? 'bg-primary' : 'bg-white/10'}`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    blur ? 'translate-x-5' : ''
                  }`}
                />
              </div>
              <div className="text-left">
                <span className="block text-sm text-gray-200">Blur background</span>
                <span className="block text-[11px] text-gray-500">
                  Uses AI segmentation. May impact performance on older devices.
                </span>
              </div>
            </button>
          </div>
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
            onClick={handleConfirm}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            {mode === 'start' ? 'Start Camera' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
