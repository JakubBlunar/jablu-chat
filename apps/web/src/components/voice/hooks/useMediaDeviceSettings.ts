import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getSavedAudioInput, getSavedAudioOutput, getSavedCamera } from '@/lib/deviceSettings'
import { changeVoiceDevice, reportVoiceDeviceError } from '@/lib/voiceDevices'

export type DeviceInfo = { deviceId: string; label: string }

export function useMediaDeviceSettings() {
  const { t } = useTranslation('voice')
  const generation = useRef(0)
  const [audioInputs, setAudioInputs] = useState<DeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<DeviceInfo[]>([])
  const [videoInputs, setVideoInputs] = useState<DeviceInfo[]>([])
  const [selectedInput, setSelectedInput] = useState(getSavedAudioInput)
  const [selectedOutput, setSelectedOutput] = useState(getSavedAudioOutput)
  const [selectedCamera, setSelectedCamera] = useState(getSavedCamera)
  const [micGranted, setMicGranted] = useState(false)
  const [cameraGranted, setCameraGranted] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [cameraDenied, setCameraDenied] = useState(false)

  const enumerateDevices = useCallback(async () => {
    const media = navigator.mediaDevices
    if (!media?.enumerateDevices) return
    const run = generation.current
    const devices = await media.enumerateDevices()
    if (generation.current !== run) return
    const options = (kind: MediaDeviceKind, key: string) =>
      devices
        .filter((device) => device.kind === kind)
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || t(key, { id: device.deviceId.slice(0, 6) })
        }))
    setAudioInputs(options('audioinput', 'settings.microphoneWithId'))
    setAudioOutputs(options('audiooutput', 'settings.speakerWithId'))
    setVideoInputs(options('videoinput', 'settings.cameraWithId'))
  }, [t])

  useEffect(() => {
    const run = ++generation.current
    const active = () => generation.current === run
    const media = navigator.mediaDevices
    async function initialize() {
      if (!media?.enumerateDevices) return
      const query = (name: PermissionName) =>
        navigator.permissions?.query?.({ name }).catch(() => null) ?? Promise.resolve(null)
      const [mic, camera] = await Promise.all([
        query('microphone' as PermissionName),
        query('camera' as PermissionName)
      ])
      if (!active()) return
      setMicGranted(mic?.state === 'granted')
      setCameraGranted(camera?.state === 'granted')
      setMicDenied(mic?.state === 'denied')
      setCameraDenied(camera?.state === 'denied')
      const streams: MediaStream[] = []
      try {
        try {
          if (mic?.state === 'granted' && media.getUserMedia) streams.push(await media.getUserMedia({ audio: true }))
          if (!active()) return
          if (camera?.state === 'granted' && media.getUserMedia) streams.push(await media.getUserMedia({ video: true }))
        } catch {
          // Device choices can still refresh when a previously granted capture fails.
        }
        if (active()) await enumerateDevices()
      } finally {
        streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
      }
    }
    const refresh = () => {
      void enumerateDevices().catch(() => undefined)
    }
    media?.addEventListener?.('devicechange', refresh)
    void initialize().catch(() => undefined)
    return () => {
      generation.current = run + 1
      media?.removeEventListener?.('devicechange', refresh)
    }
  }, [enumerateDevices])

  const requestAccess = useCallback(
    async (kind: 'audio' | 'video') => {
      const run = generation.current
      let stream: MediaStream | undefined
      try {
        stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: true } : { video: true })
        if (generation.current !== run) return
        if (kind === 'audio') {
          setMicGranted(true)
          setMicDenied(false)
        } else {
          setCameraGranted(true)
          setCameraDenied(false)
        }
        await enumerateDevices()
      } catch {
        if (generation.current !== run) return
        if (kind === 'audio') setMicDenied(true)
        else setCameraDenied(true)
      } finally {
        stream?.getTracks().forEach((track) => track.stop())
      }
    },
    [enumerateDevices]
  )

  const selectDevice = useCallback(async (kind: MediaDeviceKind, id: string) => {
    const run = generation.current
    try {
      await changeVoiceDevice(kind, id)
      if (generation.current !== run) return
      if (kind === 'audioinput') setSelectedInput(id)
      else if (kind === 'audiooutput') setSelectedOutput(id)
      else setSelectedCamera(id)
    } catch (error) {
      reportVoiceDeviceError(error)
    }
  }, [])

  return {
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
    requestMicAccess: () => requestAccess('audio'),
    requestCameraAccess: () => requestAccess('video'),
    selectInput: (id: string) => {
      void selectDevice('audioinput', id)
    },
    selectOutput: (id: string) => {
      void selectDevice('audiooutput', id)
    },
    selectCamera: (id: string) => {
      void selectDevice('videoinput', id)
    }
  }
}
