import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { isElectron } from '@/lib/electron'
import {
  getSavedAudioInput,
  setSavedAudioInput,
  getSavedAudioOutput,
  setSavedAudioOutput,
  getSavedCamera,
  setSavedCamera
} from '@/lib/deviceSettings'
import {
  type MicMode,
  type PttBinding,
  getMicMode,
  setMicMode as saveMicMode,
  getPttBinding,
  setPttBinding as savePttBinding,
  pttBindingLabel,
  getVadThreshold,
  setVadThreshold as saveVadThreshold,
  type VadMode,
  getVadMode,
  setVadMode as saveVadMode,
  stopMicMode,
  startMicMode
} from '@/lib/micMode'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

type DeviceInfo = {
  deviceId: string
  label: string
}

const supportsSinkId = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

export function VoiceSettings() {
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
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}` }))
    const outputs = devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${d.deviceId.slice(0, 6)}` }))
    const cameras = devices
      .filter((d) => d.kind === 'videoinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 6)}` }))
    setAudioInputs(inputs)
    setAudioOutputs(outputs)
    setVideoInputs(cameras)
    return { inputs, cameras }
  }, [])

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
    const all: { value: MicMode; label: string }[] = [
      { value: 'always', label: 'Always On' },
      { value: 'activity', label: 'Voice Activity' }
    ]
    if (isElectron) {
      all.push({ value: 'push-to-talk', label: 'Push to Talk' })
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
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">Microphone Mode</h3>
        <div className="flex gap-2">
          {micModeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleMicModeChange(opt.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                micMode === opt.value ? 'bg-primary text-white' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">
          {micMode === 'always' && 'Your mic stays on while unmuted.'}
          {micMode === 'activity' && 'Mic activates when you speak.'}
          {micMode === 'push-to-talk' && 'Hold a key to transmit your voice.'}
        </p>

        {micMode === 'activity' && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Threshold:</span>
              {(['auto', 'manual'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setVadModeState(m)
                    saveVadMode(m)
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    vadMode === m ? 'bg-primary text-white' : 'bg-surface-darkest text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {m === 'auto' ? 'Auto' : 'Manual'}
                </button>
              ))}
            </div>
            {vadMode === 'auto' ? (
              <p className="text-[11px] text-gray-500">
                Automatically calibrates from ambient noise when you join or unmute.
              </p>
            ) : (
              <>
                <label className="block text-xs text-gray-400">Sensitivity: {vadThreshold}</label>
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
                  <span>Sensitive</span>
                  <span>Less sensitive</span>
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
            <span className="text-xs text-gray-400">Bind:</span>
            <button
              type="button"
              onClick={handlePttRecord}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 transition ${
                recordingPtt
                  ? 'bg-primary/20 text-primary ring-primary/40'
                  : 'bg-surface-darkest text-white ring-white/10 hover:bg-white/10'
              }`}
            >
              {recordingPtt ? 'Press any key or mouse button...' : pttBindingLabel(pttBinding)}
            </button>
            {recordingPtt && <span className="text-[10px] text-gray-500">Esc to cancel</span>}
          </div>
        )}
      </div>

      {micDenied ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Microphone access was denied. Grant permission in your browser&apos;s site settings to select audio devices.
        </div>
      ) : !micGranted ? (
        <div className="rounded-md bg-surface-dark px-4 py-3">
          <p className="text-sm text-gray-300">Microphone access needed to list audio devices.</p>
          <button
            type="button"
            onClick={() => void requestMicAccess()}
            className="mt-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Allow Microphone Access
          </button>
        </div>
      ) : (
        <>
          <DeviceSelect
            label="Audio Input"
            value={selectedInput}
            devices={audioInputs}
            onChange={(v) => {
              setSelectedInput(v)
              setSavedAudioInput(v)
              const { room, isMuted, micMode: currentMicMode } = useVoiceConnectionStore.getState()
              if (room) {
                room.switchActiveDevice('audioinput', v || '').catch(() => {})
                if (!isMuted && currentMicMode !== 'always') {
                  stopMicMode()
                  setTimeout(() => startMicMode(currentMicMode), 500)
                }
              }
            }}
          />

          {supportsSinkId && (
            <DeviceSelect
              label="Audio Output"
              value={selectedOutput}
              devices={audioOutputs}
              onChange={(v) => {
                setSelectedOutput(v)
                setSavedAudioOutput(v)
                const { room } = useVoiceConnectionStore.getState()
                if (room) {
                  room.switchActiveDevice('audiooutput', v || '').catch(() => {})
                }
              }}
            />
          )}
        </>
      )}

      {cameraDenied ? (
        <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Camera access was denied. Grant permission in your browser&apos;s site settings to select a camera.
        </div>
      ) : !cameraGranted ? (
        <div className="rounded-md bg-surface-dark px-4 py-3">
          <p className="text-sm text-gray-300">Camera access needed to list video devices.</p>
          <button
            type="button"
            onClick={() => void requestCameraAccess()}
            className="mt-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white transition hover:bg-primary-hover"
          >
            Allow Camera Access
          </button>
        </div>
      ) : (
        <DeviceSelect
          label="Camera"
          value={selectedCamera}
          devices={videoInputs}
          onChange={(v) => {
            setSelectedCamera(v)
            setSavedCamera(v)
            const { room, isCameraOn } = useVoiceConnectionStore.getState()
            if (room && isCameraOn) {
              room.switchActiveDevice('videoinput', v || '').catch(() => {})
            }
          }}
        />
      )}

      <p className="text-xs text-gray-500">
        Camera resolution, background blur, and screen share quality can be configured when starting a call.
      </p>
    </div>
  )
}

function MicLevelMeter({ deviceId, threshold }: { deviceId: string; threshold: number }) {
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
        <span>Mic level:</span>
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
          title={`Threshold: ${threshold}`}
        />
      </div>
      <p className="text-[10px] text-gray-500">
        The colored line is your threshold. Speak and adjust so green exceeds it.
      </p>
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
  const isMissing = value !== '' && devices.length > 0 && !devices.some((d) => d.deviceId === value)

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase text-gray-400">{label}</h3>
      <select
        value={isMissing ? '__missing__' : value}
        onChange={(e) => {
          const v = e.target.value === '__missing__' ? '' : e.target.value
          onChange(v)
        }}
        className={`w-full rounded-md bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ${
          isMissing ? 'ring-amber-500/50' : 'ring-white/10'
        }`}
      >
        <option value="">Default</option>
        {isMissing && (
          <option value="__missing__" disabled className="text-amber-400">
            Saved device (unavailable) — using default
          </option>
        )}
        {devices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label}
          </option>
        ))}
      </select>
      {isMissing && (
        <p className="mt-1 text-xs text-amber-400/80">
          Your saved device is disconnected. Reconnect it or select a different one.
        </p>
      )}
    </div>
  )
}
