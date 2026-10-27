import { useEffect, useRef, useState } from 'react'
export function useMicrophoneLevel(deviceId: string) {
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

  return level
}
