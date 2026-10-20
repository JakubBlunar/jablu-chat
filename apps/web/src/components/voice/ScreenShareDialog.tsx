import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Toggle } from '@/components/ui/Toggle'
import { isElectron } from '@/lib/electron'
import { useSettingsStore } from '@/stores/settings.store'

export type ScreenShareSettings = {
  resolution: '720p' | '1080p' | 'native'
  fps: 5 | 15 | 20 | 30
  audio: boolean
  highQualityAudio: boolean
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
  const { t: tCommon } = useTranslation('common')
  const { t } = useTranslation('voice')
  const [resolution, setResolution] = useState<ScreenShareSettings['resolution']>('1080p')
  const [fps, setFps] = useState<ScreenShareSettings['fps']>(30)
  const [audio, setAudio] = useState(false)
  const [highQualityAudio, setHighQualityAudio] = useState(() => useSettingsStore.getState().screenShareHighQualityAudio)
  const setScreenShareHighQualityAudio = useSettingsStore((s) => s.setScreenShareHighQualityAudio)

  const supportsAudio = !isElectron || /win|linux/i.test(navigator.userAgent)

  return (
    <ModalOverlay onClose={onClose} zIndex="z-[200]" noPadding>
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <h2 className="text-lg font-semibold text-white">{t('screenShareSetup.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
          </svg>
        </button>
      </div>

      <div className="space-y-5 px-6 py-5">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">{t('screenShareSetup.resolution')}</h3>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResolution(r)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition ${
                  resolution === r ? 'bg-primary text-primary-text' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                }`}
              >
                {r === 'native' ? t('screenSharePicker.native') : r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">{t('screenShareSetup.frameRate')}</h3>
          <div className="flex gap-2">
            {FPS_OPTIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFps(f)}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  fps === f ? 'bg-primary text-primary-text' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                }`}
              >
                {f} {t('screenShareSetup.fpsUnit')}
              </button>
            ))}
          </div>
        </div>

        {supportsAudio && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-gray-400">{t('screenShareSetup.audio')}</h3>
            <div
              onClick={() => setAudio(!audio)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
            >
              <Toggle checked={audio} onChange={setAudio} />
              <div className="text-left">
                <span className="block text-sm text-gray-200">{t('screenShareSetup.includeAudio')}</span>
                <span className="block text-[11px] text-gray-500">{t('screenShareSetup.includeAudioHint')}</span>
              </div>
            </div>
            {audio && (
              <div
                onClick={() => {
                  const next = !highQualityAudio
                  setHighQualityAudio(next)
                  setScreenShareHighQualityAudio(next)
                }}
                className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-md bg-surface-darkest px-4 py-3 transition hover:bg-white/5"
              >
                <Toggle
                  checked={highQualityAudio}
                  onChange={(v) => {
                    setHighQualityAudio(v)
                    setScreenShareHighQualityAudio(v)
                  }}
                />
                <div className="text-left">
                  <span className="block text-sm text-gray-200">{t('screenShareSetup.betterAudio')}</span>
                  <span className="block text-[11px] text-gray-500">
                    {t('screenShareSetup.betterAudioHint')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ resolution, fps, audio, highQualityAudio: audio ? highQualityAudio : false })}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover"
        >
          {t('screenShareSetup.shareScreen')}
        </button>
      </div>
    </ModalOverlay>
  )
}
