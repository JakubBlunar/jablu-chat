import { getValidatedDevices } from '@/lib/deviceSettings'
import { isElectron } from '@/lib/electron'
import {
  getMicMode,
  getVadMode,
  getVadThreshold,
  setMicMode as saveMicMode,
  setVadMode as saveVadMode,
  setVadThreshold as saveVadThreshold,
  startMicMode,
  stopMicMode,
  type MicMode,
  type VadMode
} from '@/lib/micMode'
import { getNoiseReductionCapabilities } from '@/lib/noiseReductionCapabilities'
import { reportVoiceDeviceError } from '@/lib/voiceDevices'
import { enqueueMicrophoneOperation } from '@/lib/voiceMicOperations'
import { restartMicrophonePipeline } from '@/lib/voiceMicPipelineRestart'
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
import { useSettingsStore } from '@/stores/settings.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMediaDeviceSettings } from './useMediaDeviceSettings'
import { usePushToTalkCapture } from './usePushToTalkCapture'
export function useVoiceSettings() {
  const { t } = useTranslation('voice')
  const devices = useMediaDeviceSettings()
  const { pttBinding, recordingPtt, handlePttRecord } = usePushToTalkCapture()
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

  const [vadThreshold, setVadThreshold] = useState(getVadThreshold)
  const [vadMode, setVadModeState] = useState<VadMode>(getVadMode)

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

  const handleMicModeChange = useCallback(
    (mode: MicMode) => {
      setMicMode(mode)
      saveMicMode(mode)
      storeSetMicMode(mode)
    },
    [storeSetMicMode]
  )

  const changeNoiseSuppression = useCallback(
    (value: boolean) => {
      setCapNoiseSuppression(value)
      saveCaptureNS(value)
      void applyNoisePipeline()
    },
    [applyNoisePipeline]
  )

  const changeAutoGain = useCallback(
    (value: boolean) => {
      setCapAutoGain(value)
      saveCaptureAGC(value)
      void applyNoisePipeline()
    },
    [applyNoisePipeline]
  )

  const changeEchoCancellation = useCallback(
    (value: boolean) => {
      setCapEchoCancellation(value)
      saveCaptureEcho(value)
      void applyNoisePipeline()
    },
    [applyNoisePipeline]
  )

  const changeVadMode = useCallback((value: VadMode) => {
    setVadModeState(value)
    saveVadMode(value)
  }, [])
  const changeVadThreshold = useCallback((value: number) => {
    setVadThreshold(value)
    saveVadThreshold(value)
  }, [])

  return {
    ...devices,
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
  }
}
