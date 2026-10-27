import { ToggleRow } from '@/components/settings/ToggleRow'
import { Button } from '@/components/ui'
import { type PttBinding } from '@/lib/micMode'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { DeviceInfo } from './hooks/useMediaDeviceSettings'
import { useMicrophoneLevel } from './hooks/useMicrophoneLevel'
import { useVoiceSettings } from './hooks/useVoiceSettings'
import { MicrophoneTest } from './MicrophoneTest'

const supportsSinkId = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

function formatPttBindingLabel(binding: PttBinding, t: TFunction<'voice'>): string {
  if (binding.type === 'mouse') {
    const labels: Record<number, string> = {
      0: t('settings.mouseLeftClick'),
      1: t('settings.mouseMiddleClick'),
      2: t('settings.mouseRightClick')
    }
    return labels[binding.button] ?? t('settings.mouseButton', { button: binding.button + 1 })
  }
  if (binding.key === ' ') return t('settings.space')
  if (binding.key.length === 1) return binding.key.toUpperCase()
  return binding.key
}

export function VoiceSettings() {
  const {
    audioInputs,
    audioOutputs,
    videoInputs,
    selectedInput,
    selectedOutput,
    selectedCamera,
    micGranted,
    cameraGranted,
    micDenied,
    cameraDenied,
    requestMicAccess,
    requestCameraAccess,
    selectInput,
    selectOutput,
    selectCamera,
    t,
    pttBinding,
    recordingPtt,
    handlePttRecord,
    micModeOptions,
    micMode,
    vadThreshold,
    vadMode,
    voiceJoinMuted,
    voiceJoinDeafened,
    setVoiceJoinMuted,
    setVoiceJoinDeafened,
    noiseCaps,
    noiseMode,
    capNoiseSuppression,
    capAutoGain,
    capEchoCancellation,
    handleNoiseModeChange,
    noiseModeOptions,
    noiseModeHint,
    handleMicModeChange,
    changeNoiseSuppression,
    changeAutoGain,
    changeEchoCancellation,
    changeVadMode,
    changeVadThreshold
  } = useVoiceSettings()
  return (
    <div className="space-y-6">
      <MicrophoneTest
        key={`${noiseMode}-${capNoiseSuppression}-${capAutoGain}-${capEchoCancellation}`}
        deviceId={selectedInput}
        outputId={selectedOutput}
      />
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">{t('settings.whenJoining')}</h3>
        <div className="space-y-2 rounded-md bg-surface-darkest/80 p-3">
          <ToggleRow
            layout="inline"
            label={t('settings.joinMuted')}
            description={t('settings.joinMutedHint')}
            checked={voiceJoinMuted}
            onChange={setVoiceJoinMuted}
          />
          <ToggleRow
            layout="inline"
            label={t('settings.joinDeafened')}
            description={t('settings.joinDeafenedHint')}
            checked={voiceJoinDeafened}
            onChange={setVoiceJoinDeafened}
          />
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">{t('settings.microphoneMode')}</h3>
        <div className="flex gap-2">
          {micModeOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={micMode === opt.value ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => handleMicModeChange(opt.value)}
              className={micMode === opt.value ? '' : 'bg-surface-darkest hover:bg-white/10'}
            >
              {t(opt.labelKey)}
            </Button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          {micMode === 'always' && t('settings.micModeAlwaysHint')}
          {micMode === 'activity' && t('settings.micModeActivityHint')}
          {micMode === 'push-to-talk' && t('settings.micModePttHint')}
        </p>

        {micMode === 'activity' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{t('settings.threshold')}</span>
              {(['auto', 'manual'] as const).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={vadMode === m ? 'primary' : 'secondary'}
                  size="xs"
                  onClick={() => changeVadMode(m)}
                  className={vadMode === m ? '' : 'bg-surface-darkest hover:bg-white/10'}
                >
                  {m === 'auto' ? t('settings.auto') : t('settings.manual')}
                </Button>
              ))}
            </div>
            {vadMode === 'auto' ? (
              <p className="text-[11px] text-gray-500">{t('settings.autoCalibrateHint')}</p>
            ) : (
              <>
                <label className="block text-xs text-gray-400">
                  {t('settings.sensitivity', { value: vadThreshold })}
                </label>
                <input
                  type="range"
                  min={1}
                  max={60}
                  value={vadThreshold}
                  onChange={(e) => changeVadThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="mt-0.5 flex justify-between text-[10px] text-gray-500">
                  <span>{t('settings.sensitive')}</span>
                  <span>{t('settings.lessSensitive')}</span>
                </div>
                <div className="mt-2">
                  <MicLevelMeter deviceId={selectedInput} threshold={vadThreshold} />
                </div>
              </>
            )}
          </div>
        )}

        {micMode === 'push-to-talk' && (
          <div className="mt-3 flex items-center gap-3">
            <span className="text-xs text-gray-400">{t('settings.bind')}</span>
            <button
              type="button"
              onClick={handlePttRecord}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 transition ${
                recordingPtt
                  ? 'bg-primary/20 text-primary ring-primary/40'
                  : 'bg-surface-darkest text-white ring-white/10 hover:bg-white/10'
              }`}
            >
              {recordingPtt ? t('settings.recordBinding') : formatPttBindingLabel(pttBinding, t)}
            </button>
            {recordingPtt && <span className="text-[10px] text-gray-500">{t('settings.cancelBinding')}</span>}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">{t('settings.noiseReduction')}</h3>
        <div className="flex flex-wrap gap-2">
          {noiseModeOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={noiseMode === opt.value ? 'primary' : 'secondary'}
              size="sm"
              disabled={opt.value === 'rnnoise' && !noiseCaps.audioWorklet}
              onClick={() => handleNoiseModeChange(opt.value)}
              className={noiseMode === opt.value ? '' : 'bg-surface-darkest hover:bg-white/10'}
            >
              {t(opt.labelKey)}
            </Button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">{noiseModeHint ? t(noiseModeHint) : null}</p>

        <div className="mt-3 space-y-2 rounded-md bg-surface-darkest/80 p-3">
          <p className="text-[11px] font-medium uppercase text-gray-500">{t('settings.captureProcessing')}</p>
          <ToggleRow
            layout="inline"
            label={t('settings.noiseSuppression')}
            checked={capNoiseSuppression}
            onChange={changeNoiseSuppression}
            disabled={noiseMode === 'rnnoise'}
          />
          <ToggleRow
            layout="inline"
            label={t('settings.automaticGain')}
            checked={capAutoGain}
            onChange={changeAutoGain}
          />
          <ToggleRow
            layout="inline"
            label={t('settings.echoCancellation')}
            checked={capEchoCancellation}
            onChange={changeEchoCancellation}
          />
          {noiseMode === 'rnnoise' && <p className="text-[11px] text-gray-500">{t('settings.rnnoiseCaptureHint')}</p>}
        </div>
      </div>

      {micDenied ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          {t('settings.microphoneDenied')}
        </div>
      ) : !micGranted ? (
        <div className="rounded-md bg-surface-dark px-4 py-3">
          <p className="text-sm text-gray-300">{t('settings.microphoneNeeded')}</p>
          <Button type="button" size="sm" onClick={() => void requestMicAccess()} className="mt-2 rounded-md">
            {t('settings.allowMicrophone')}
          </Button>
        </div>
      ) : (
        <>
          <DeviceSelect label={t('audioinput')} value={selectedInput} devices={audioInputs} onChange={selectInput} />

          {supportsSinkId && (
            <DeviceSelect
              label={t('audiooutput')}
              value={selectedOutput}
              devices={audioOutputs}
              onChange={selectOutput}
            />
          )}
        </>
      )}

      {cameraDenied ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">{t('settings.cameraDenied')}</div>
      ) : !cameraGranted ? (
        <div className="rounded-md bg-surface-dark px-4 py-3">
          <p className="text-sm text-gray-300">{t('settings.cameraNeeded')}</p>
          <Button type="button" size="sm" onClick={() => void requestCameraAccess()} className="mt-2 rounded-md">
            {t('settings.allowCamera')}
          </Button>
        </div>
      ) : (
        <DeviceSelect label={t('videoinput')} value={selectedCamera} devices={videoInputs} onChange={selectCamera} />
      )}

      <p className="text-xs text-gray-500">{t('settings.callQualityHint')}</p>
    </div>
  )
}

function MicLevelMeter({ deviceId, threshold }: { deviceId: string; threshold: number }) {
  const { t } = useTranslation('voice')
  const level = useMicrophoneLevel(deviceId)
  const maxBar = 60
  const pct = Math.min((level / maxBar) * 100, 100)
  const threshPct = Math.min((threshold / maxBar) * 100, 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>{t('settings.micLevel')}</span>
        <span className="font-mono">{Math.round(level)}</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-surface-darkest">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-75 ${
            level > threshold ? 'bg-green-500' : 'bg-gray-500'
          }`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-primary"
          style={{ left: `${threshPct}%` }}
          title={t('settings.thresholdTitle', { value: threshold })}
        />
      </div>
      <p className="text-[10px] text-gray-500">{t('settings.thresholdExplanation')}</p>
    </div>
  )
}

function DeviceSelect({
  label,
  value,
  devices,
  onChange
}: {
  label: string
  value: string
  devices: DeviceInfo[]
  onChange: (v: string) => void
}) {
  const { t } = useTranslation('voice')
  const isMissing = value !== '' && devices.length > 0 && !devices.some((d) => d.deviceId === value)
  const selectId = `voice-device-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div>
      <label htmlFor={selectId} className="mb-3 block text-sm font-semibold uppercase text-gray-400">
        {label}
      </label>
      <select
        id={selectId}
        value={isMissing ? '__missing__' : value}
        onChange={(e) => {
          const v = e.target.value === '__missing__' ? '' : e.target.value
          onChange(v)
        }}
        className={`w-full rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ${
          isMissing ? 'ring-amber-500/50' : 'ring-white/10'
        }`}
      >
        <option value="">{t('settings.defaultDevice')}</option>
        {isMissing && (
          <option value="__missing__" disabled className="text-amber-400">
            {t('settings.missingDevice')}
          </option>
        )}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      {isMissing && <p className="mt-1 text-xs text-amber-400/80">{t('settings.missingDeviceHint')}</p>}
    </div>
  )
}
