export type MicMode = 'always' | 'activity' | 'push-to-talk'

import { Track } from 'livekit-client'
import { useSettingsStore } from '@/stores/settings.store'

type RoomGetter = () => import('livekit-client').Room | null
let _getRoom: RoomGetter = () => null

export function setRoomGetter(fn: RoomGetter) {
  _getRoom = fn
}

export type PttBinding = { type: 'key'; key: string } | { type: 'mouse'; button: number }

export type VadMode = 'auto' | 'manual'

export function getMicMode(): MicMode {
  return useSettingsStore.getState().micMode
}

export function setMicMode(mode: MicMode) {
  useSettingsStore.getState().setMicMode(mode)
}

export function getPttBinding(): PttBinding {
  return useSettingsStore.getState().pttBinding
}

export function setPttBinding(binding: PttBinding) {
  useSettingsStore.getState().setPttBinding(binding)
}

export function pttBindingLabel(binding: PttBinding): string {
  if (binding.type === 'mouse') {
    const names: Record<number, string> = {
      0: 'Left Click',
      1: 'Middle Click',
      2: 'Right Click',
      3: 'Mouse 4',
      4: 'Mouse 5'
    }
    return names[binding.button] ?? `Mouse ${binding.button + 1}`
  }
  if (binding.key === ' ') return 'Space'
  if (binding.key.length === 1) return binding.key.toUpperCase()
  return binding.key
}

export function getVadThreshold(): number {
  return useSettingsStore.getState().vadThreshold
}

export function setVadThreshold(threshold: number) {
  useSettingsStore.getState().setVadThreshold(threshold)
}

export function getVadMode(): VadMode {
  return useSettingsStore.getState().vadMode
}

export function setVadMode(mode: VadMode) {
  useSettingsStore.getState().setVadMode(mode)
}

let vadCleanup: ((skipUnmute?: boolean) => void) | null = null
let pttCleanup: ((skipUnmute?: boolean) => void) | null = null

export function startMicMode(mode: MicMode) {
  stopMicMode()

  if (mode === 'activity') {
    vadCleanup = startVAD()
  } else if (mode === 'push-to-talk') {
    pttCleanup = startPTT()
  }
}

export function stopMicMode(skipUnmute = false) {
  vadCleanup?.(skipUnmute)
  vadCleanup = null
  pttCleanup?.(skipUnmute)
  pttCleanup = null
}

function startVAD(): () => void {
  const room = _getRoom()
  if (!room) return () => {}

  const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  const mediaTrack = micPub?.track?.mediaStreamTrack
  if (!mediaTrack) return () => {}

  const analysisTrack = mediaTrack.clone()
  const audioCtx = new AudioContext()
  const source = audioCtx.createMediaStreamSource(new MediaStream([analysisTrack]))
  const analyser = audioCtx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.45
  source.connect(analyser)

  const dataArray = new Uint8Array(analyser.frequencyBinCount)
  let speaking = false
  let silenceFrames = 0
  const SILENCE_DELAY = 35

  let running = true
  const isAuto = getVadMode() === 'auto'
  let calibrated = !isAuto
  let autoThreshold = 0
  const calibrationSamples: number[] = []
  const calibrationStart = performance.now()
  const CALIBRATION_MS = 1500

  function getAvg(): number {
    analyser.getByteFrequencyData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i]
    }
    return sum / dataArray.length
  }

  function tick() {
    if (!running) return

    const avg = getAvg()

    if (!calibrated) {
      calibrationSamples.push(avg)
      if (performance.now() - calibrationStart >= CALIBRATION_MS) {
        const ambient = calibrationSamples.reduce((a, b) => a + b, 0) / calibrationSamples.length
        autoThreshold = Math.max(Math.round(ambient * 1.8 + 5), 8)
        calibrated = true
      }
      requestAnimationFrame(tick)
      return
    }

    const threshold = isAuto ? autoThreshold : getVadThreshold()

    if (avg > threshold) {
      silenceFrames = 0
      if (!speaking) {
        speaking = true
        setTrackMuted(false)
      }
    } else {
      silenceFrames++
      if (speaking && silenceFrames > SILENCE_DELAY) {
        speaking = false
        setTrackMuted(true)
      }
    }

    requestAnimationFrame(tick)
  }

  setTrackMuted(true)
  requestAnimationFrame(tick)

  const onVisibility = () => {
    if (document.hidden) {
      setTrackMuted(false)
    } else {
      speaking = false
      silenceFrames = SILENCE_DELAY + 1
      setTrackMuted(true)
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  return (skipUnmute?: boolean) => {
    running = false
    document.removeEventListener('visibilitychange', onVisibility)
    source.disconnect()
    analysisTrack.stop()
    audioCtx.close().catch(() => {})
    if (!skipUnmute) setTrackMuted(false)
  }
}

function startPTT(): () => void {
  const binding = getPttBinding()

  setTrackMuted(true)

  if (binding.type === 'mouse') {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === binding.button) {
        e.preventDefault()
        setTrackMuted(false)
      }
    }
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === binding.button) {
        e.preventDefault()
        setTrackMuted(true)
      }
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)

    // Prevent context menu for right-click PTT
    const onContext = (e: Event) => {
      if (binding.button === 2) e.preventDefault()
    }
    window.addEventListener('contextmenu', onContext)

    return (skipUnmute?: boolean) => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContext)
      if (!skipUnmute) setTrackMuted(false)
    }
  }

  // Keyboard binding
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    if (isInputFocused()) return
    if (e.key === binding.key) {
      e.preventDefault()
      setTrackMuted(false)
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (isInputFocused()) return
    if (e.key === binding.key) {
      e.preventDefault()
      setTrackMuted(true)
    }
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)

  return (skipUnmute?: boolean) => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    if (!skipUnmute) setTrackMuted(false)
  }
}

function setTrackMuted(muted: boolean) {
  const room = _getRoom()
  if (!room) return

  const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone)
  if (micPub?.track) {
    if (muted) {
      micPub.track.mute()
    } else {
      micPub.track.unmute()
    }
  }
}

function isInputFocused(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || (el as HTMLElement).isContentEditable
}
