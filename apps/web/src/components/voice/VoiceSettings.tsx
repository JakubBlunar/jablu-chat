import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { isElectron } from '@/lib/electron'
import { getSavedAudioInput, getSavedAudioOutput, getSavedCamera, getValidatedDevices } from '@/lib/deviceSettings'
import { getNoiseReductionCapabilities } from '@/lib/noiseReductionCapabilities'
import { restartMicrophonePipeline } from '@/lib/voiceMicPipelineRestart'
import { changeVoiceDevice, reportVoiceDeviceError } from '@/lib/voiceDevices'
import {
  getCaptureAutoGainControl,
  getCaptureEchoCancellation,
  getCaptureNoiseSuppression,
  getNoiseReductionMode,
  setCaptureAutoGainControl as saveCaptureAGC,
  setCaptureEchoCancellation as saveCaptureEcho,
  setCaptureNoiseSuppression as saveCaptureNS,
  setNoiseReductionMode as saveNoiseReductionMode,
  type NoiseReductionMode
} from '@/lib/voiceProcessingSettings'
import {
  type MicMode,
  type PttBinding,
  getMicMode,
  setMicMode as saveMicMode,
  getPttBinding,
  setPttBinding as savePttBinding,
  getVadThreshold,
  setVadThreshold as saveVadThreshold,
  type VadMode,
  getVadMode,
  startMicMode,
  stopMicMode,
  setVadMode as saveVadMode
} from '@/lib/micMode'
import { Button } from '@/components/ui'
import { Toggle } from '@/components/ui/Toggle'
import { useSettingsStore } from '@/stores/settings.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { MicrophoneTest } from './MicrophoneTest'
import { enqueueMicrophoneOperation } from '@/lib/voiceMicOperations'

type DeviceInfo = {
  deviceId: string
  label: string
}

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
  const { t } = useTranslation('voice')
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([])
  const [micDenied, setMicDenied] = useState(false)
  const [cameraDenied, setCameraDenied] = useState(false)

  const [selectedInput, setSelectedInput] = useState(getSavedAudioInput)
  const [selectedOutput, setSelectedOutput] = useState(getSavedAudioOutput)
  const [selectedCamera, setSelectedCamera] = useState(getSavedCamera)

  const [micGranted, setMicGranted] = useState(false)
  const [cameraGranted, setCameraGranted] = useState(false)

  const enumerateDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || t('settings.microphoneWithId', { id: d.deviceId.slice(0, 6) })
      }))
    const outputs = devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || t('settings.speakerWithId', { id: d.deviceId.slice(0, 6) })
      }))
    const cameras = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || t('settings.cameraWithId', { id: d.deviceId.slice(0, 6) })
      }))
    setAudioInputs(inputs)
    setAudioOutputs(outputs)
    setVideoInputs(cameras)
    return { inputs, cameras }
  }, [t])

  useEffect(() => {
    let cancelled = false

    async function checkAndEnumerate() {
      let micAllowed = false
      let camAllowed = false

      if (navigator.permissions?.query) {
        const [micPerm, camPerm] = await Promise.all([
          navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null),
          navigator.permissions.query({ name: 'camera' as PermissionName }).catch(() => null)
        ])
        micAllowed = micPerm?.state === 'granted'
        camAllowed = camPerm?.state === 'granted'
        if (micPerm?.state === 'denied') setMicDenied(true)
        if (camPerm?.state === 'denied') setCameraDenied(true)
      }

      if (cancelled) return
      setMicGranted(micAllowed)
      setCameraGranted(camAllowed)

      if (micAllowed || camAllowed) {
        const streams: MediaStream[] = []
        try {
          if (micAllowed) {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true })
            streams.push(s)
          }
          if (camAllowed) {
            const s = await navigator.mediaDevices.getUserMedia({ video: true })
            streams.push(s)
          }
        } catch {
          /* ignored */
        }
        if (!cancelled) await enumerateDevices()
        for (const s of streams) s.getTracks().forEach((t) => t.stop())
      } else {
        await enumerateDevices()
      }
    }

    void checkAndEnumerate()
    return () => {
      cancelled = true
    }
  }, [enumerateDevices])

  const requestMicAccess = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicGranted(true)
      setMicDenied(false)
      await enumerateDevices()
    } catch {
      setMicDenied(true)
    }
  }, [enumerateDevices])

  const requestCameraAccess = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stream.getTracks().forEach((t) => t.stop())
      setCameraGranted(true)
      setCameraDenied(false)
      await enumerateDevices()
    } catch {
      setCameraDenied(true)
    }
  }, [enumerateDevices])

  const micModeOptions = useMemo(() => {
    const all: { value: MicMode; labelKey: string }[] = [
      { value: 'always', labelKey: 'settings.micModeAlways' },
      { value: 'activity', labelKey: 'settings.micModeActivity' }
    ]
    if (isElectron) {
      all.push({ value: 'push-to-talk', labelKey: 'settings.micModePtt' })
    }
    return all
  }, [])

  const [micMode, setMicMode] = useState<MicMode>(() => {
    const saved = getMicMode()
    if (saved === 'push-to-talk' && !isElectron) return 'activity'
    return saved
  })
  const [pttBinding, setPttBinding] = useState<PttBinding>(getPttBinding)
  const [vadThreshold, setVadThreshold] = useState(getVadThreshold)
  const [vadMode, setVadModeState] = useState<VadMode>(getVadMode)
  const [recordingPtt, setRecordingPtt] = useState(false)
  const pttCleanupRef = useRef<(() => void) | null>(null)
  const storeSetMicMode = useVoiceConnectionStore((s) => s.setMicMode)

  const voiceJoinMuted = useSettingsStore((s) => s.voiceJoinMuted)
  const voiceJoinDeafened = useSettingsStore((s) => s.voiceJoinDeafened)
  const setVoiceJoinMuted = useSettingsStore((s) => s.setVoiceJoinMuted)
  const setVoiceJoinDeafened = useSettingsStore((s) => s.setVoiceJoinDeafened)

  const noiseCaps = useMemo(() => getNoiseReductionCapabilities(), [])
  const [noiseMode, setNoiseMode] = useState<NoiseReductionMode>(getNoiseReductionMode)
  const [capNoiseSuppression, setCapNoiseSuppression] = useState(getCaptureNoiseSuppression)
  const [capAutoGain, setCapAutoGain] = useState(getCaptureAutoGainControl)
  const [capEchoCancellation, setCapEchoCancellation] = useState(getCaptureEchoCancellation)

  const applyNoisePipeline = useCallback(async () => {
    const { room } = useVoiceConnectionStore.getState()
    if (!room) return
    try {
      await enqueueMicrophoneOperation(room, async () => {
        await stopMicMode(true)
        const { audioInput } = await getValidatedDevices()
        const state = useVoiceConnectionStore.getState()
        if (state.room !== room) return
        await restartMicrophonePipeline(room, audioInput || undefined, !state.isMuted && !state.isDeafened, () => {
          const latest = useVoiceConnectionStore.getState()
          return latest.room === room && !latest.isMuted && !latest.isDeafened
        })
        const current = useVoiceConnectionStore.getState()
        if (current.room === room && !current.isMuted && !current.isDeafened && current.micMode !== 'always')
          startMicMode(current.micMode)
      })
    } catch (error) {
      reportVoiceDeviceError(error)
      if (useVoiceConnectionStore.getState().room === room) {
        await useVoiceConnectionStore.getState().requestMicrophone(false)
        useVoiceConnectionStore.setState({ microphoneError: 'device' })
      }
    }
  }, [])

  const handleNoiseModeChange = useCallback(
    (m: NoiseReductionMode) => {
      if (m === 'rnnoise' && !noiseCaps.audioWorklet) {
        window.dispatchEvent(
          new CustomEvent('voice:error', {
            detail: { message: t('settings.rnnoiseUnsupportedError') }
          })
        )
        return
      }
      setNoiseMode(m)
      saveNoiseReductionMode(m)
      void applyNoisePipeline()
    },
    [applyNoisePipeline, noiseCaps.audioWorklet, t]
  )

  const noiseModeOptions = useMemo(
    () =>
      [
        {
          value: 'standard' as const,
          labelKey: 'settings.noiseStandard',
          hintKey: 'settings.noiseStandardHint'
        },
        {
          value: 'enhanced_browser' as const,
          labelKey: 'settings.noiseEnhanced',
          hintKey: noiseCaps.voiceIsolation
            ? 'settings.noiseEnhancedIsolationHint'
            : 'settings.noiseEnhancedNoIsolationHint'
        },
        {
          value: 'rnnoise' as const,
          labelKey: 'settings.noiseRnnoise',
          hintKey: noiseCaps.audioWorklet ? 'settings.noiseRnnoiseHint' : 'settings.noiseUnavailableHint'
        }
      ] as const,
    [noiseCaps.audioWorklet, noiseCaps.voiceIsolation]
  )
  const noiseModeHint = noiseModeOptions.find((option) => option.value === noiseMode)?.hintKey

  useEffect(() => {
    return () => {
      pttCleanupRef.current?.()
      pttCleanupRef.current = null
    }
  }, [])

  const handleMicModeChange = useCallback(
    (mode: MicMode) => {
      setMicMode(mode)
      saveMicMode(mode)
      storeSetMicMode(mode)
    },
    [storeSetMicMode]
  )

  const handlePttRecord = useCallback(() => {
    setRecordingPtt(true)

    const finish = (binding: PttBinding) => {
      setPttBinding(binding)
      savePttBinding(binding)
      setRecordingPtt(false)
      cleanup()
      if (getMicMode() === 'push-to-talk') {
        useVoiceConnectionStore.getState().setMicMode('push-to-talk')
      }
    }

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingPtt(false)
        cleanup()
        return
      }
      finish({ type: 'key', key: e.key })
    }

    const onMouse = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      finish({ type: 'mouse', button: e.button })
    }

    const onContext = (e: Event) => e.preventDefault()

    const cleanup = () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onMouse, true)
      window.removeEventListener('contextmenu', onContext, true)
      pttCleanupRef.current = null
    }

    pttCleanupRef.current?.()
    pttCleanupRef.current = cleanup

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onMouse, true)
    window.addEventListener('contextmenu', onContext, true)
  }, [])

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
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle checked={voiceJoinMuted} onChange={(v) => setVoiceJoinMuted(v)} />
            <div>
              <span className="block text-sm text-gray-200">{t('settings.joinMuted')}</span>
              <span className="block text-[11px] text-gray-500">{t('settings.joinMutedHint')}</span>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle checked={voiceJoinDeafened} onChange={(v) => setVoiceJoinDeafened(v)} />
            <div>
              <span className="block text-sm text-gray-200">{t('settings.joinDeafened')}</span>
              <span className="block text-[11px] text-gray-500">{t('settings.joinDeafenedHint')}</span>
            </div>
          </label>
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
                  onClick={() => {
                    setVadModeState(m)
                    saveVadMode(m)
                  }}
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
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setVadThreshold(v)
                    saveVadThreshold(v)
                  }}
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
          <label className={`flex cursor-pointer items-center gap-3 ${noiseMode === 'rnnoise' ? 'opacity-60' : ''}`}>
            <Toggle
              checked={capNoiseSuppression}
              disabled={noiseMode === 'rnnoise'}
              onChange={(v) => {
                setCapNoiseSuppression(v)
                saveCaptureNS(v)
                void applyNoisePipeline()
              }}
            />
            <span className="text-sm text-gray-200">{t('settings.noiseSuppression')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle
              checked={capAutoGain}
              onChange={(v) => {
                setCapAutoGain(v)
                saveCaptureAGC(v)
                void applyNoisePipeline()
              }}
            />
            <span className="text-sm text-gray-200">{t('settings.automaticGain')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <Toggle
              checked={capEchoCancellation}
              onChange={(v) => {
                setCapEchoCancellation(v)
                saveCaptureEcho(v)
                void applyNoisePipeline()
              }}
            />
            <span className="text-sm text-gray-200">{t('settings.echoCancellation')}</span>
          </label>
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
          <DeviceSelect
            label={t('audioinput')}
            value={selectedInput}
            devices={audioInputs}
            onChange={(v) => {
              void changeVoiceDevice('audioinput', v)
                .then(() => setSelectedInput(v))
                .catch(reportVoiceDeviceError)
            }}
          />

          {supportsSinkId && (
            <DeviceSelect
              label={t('audiooutput')}
              value={selectedOutput}
              devices={audioOutputs}
              onChange={(v) => {
                void changeVoiceDevice('audiooutput', v)
                  .then(() => setSelectedOutput(v))
                  .catch(reportVoiceDeviceError)
              }}
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
        <DeviceSelect
          label={t('videoinput')}
          value={selectedCamera}
          devices={videoInputs}
          onChange={(v) => {
            void changeVoiceDevice('videoinput', v)
              .then(() => setSelectedCamera(v))
              .catch(reportVoiceDeviceError)
          }}
        />
      )}

      <p className="text-xs text-gray-500">{t('settings.callQualityHint')}</p>
    </div>
  )
}

function MicLevelMeter({ deviceId, threshold }: { deviceId: string; threshold: number }) {
  const { t } = useTranslation('voice')
  const [level, setLevel] = useState(0)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let running = true

    async function start() {
      try {
        const constraints: MediaStreamConstraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (!running) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const audioCtx = new AudioContext()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.2
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        function tick() {
          if (!running) return
          analyser.getByteFrequencyData(dataArray)
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
          setLevel(sum / dataArray.length)
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)

        cleanupRef.current = () => {
          running = false
          source.disconnect()
          audioCtx.close().catch(() => {})
          stream.getTracks().forEach((t) => t.stop())
        }
      } catch {
        // mic denied or unavailable
      }
    }

    void start()

    return () => {
      running = false
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [deviceId])

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
