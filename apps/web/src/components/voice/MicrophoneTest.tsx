import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createMicrophoneCapture, type MicrophoneCapture } from '@/lib/microphoneCapture'
import { buildAudioCaptureOptionsForMode } from '@/lib/voiceAudioCaptureOptions'
import { getNoiseReductionMode } from '@/lib/voiceProcessingSettings'
import { canUseRnnoise } from '@/lib/noiseReductionCapabilities'

export function MicrophoneTest({ deviceId, outputId }: { deviceId: string; outputId: string }) {
  const { t } = useTranslation('voice')
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording'>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const run = useRef(0)
  const resources = useRef<{
    capture?: MicrophoneCapture
    ctx?: AudioContext
    recorder?: MediaRecorder
    frame?: number
    timer?: ReturnType<typeof setTimeout>
  }>({})
  const release = useCallback(() => {
    const current = resources.current
    resources.current = {}
    if (current.frame !== undefined) cancelAnimationFrame(current.frame)
    if (current.timer) clearTimeout(current.timer)
    if (current.recorder?.state === 'recording') current.recorder.stop()
    void current.capture?.dispose().catch(console.error)
    if (current.ctx && current.ctx.state !== 'closed') void current.ctx.close().catch(console.error)
  }, [])
  useEffect(
    () => () => {
      run.current++
      release()
    },
    [release]
  )
  useEffect(() => {
    run.current++
    release()
    setPhase('idle')
    setLevel(0)
    setUrl(null)
  }, [deviceId, release])
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  useEffect(() => {
    const audio = audioRef.current
    if (audio?.setSinkId) void audio.setSinkId(outputId).catch(() => setError(t('audioOutputError')))
  }, [url, outputId, t])

  const start = async () => {
    const request = ++run.current
    release()
    setUrl(null)
    setError(null)
    setPhase('starting')
    try {
      if (typeof MediaRecorder === 'undefined') throw new Error('Recording unavailable')
      const savedMode = getNoiseReductionMode()
      const mode = savedMode === 'rnnoise' && !canUseRnnoise() ? 'standard' : savedMode
      const capture = await createMicrophoneCapture(mode, buildAudioCaptureOptionsForMode(mode, deviceId || undefined))
      if (run.current !== request) {
        await capture.dispose()
        return
      }
      resources.current.capture = capture
      const ctx = new AudioContext({ latencyHint: 'interactive' })
      resources.current.ctx = ctx
      await ctx.resume()
      if (run.current !== request) return
      const stream = new MediaStream([capture.track.mediaStreamTrack])
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const samples = new Float32Array(analyser.fftSize)
      const tick = () => {
        if (run.current !== request) return
        analyser.getFloatTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += sample * sample
        // Display a dBFS meter from -60 dB to 0 dB after the chosen processing.
        const db = 20 * Math.log10(Math.max(Math.sqrt(sum / samples.length), 0.001))
        setLevel(Math.round(Math.max(0, Math.min(100, ((db + 60) / 60) * 100))))
        resources.current.frame = requestAnimationFrame(tick)
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      resources.current.recorder = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        if (run.current !== request) return
        if (chunks.length) setUrl(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })))
        release()
        setPhase('idle')
        setLevel(0)
      }
      recorder.onerror = () => {
        if (run.current !== request) return
        run.current++
        release()
        setPhase('idle')
        setError(t('micTest.failed'))
      }
      recorder.start()
      setPhase('recording')
      tick()
      resources.current.timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), 5000)
    } catch (cause) {
      if (run.current !== request) return
      run.current++
      release()
      setPhase('idle')
      setError(
        t(
          cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? 'microphonePermissionError'
            : 'micTest.failed'
        )
      )
    }
  }

  return (
    <section className="space-y-3 rounded-md bg-surface-darkest/80 p-3" aria-label={t('micTest.title')}>
      <h3 className="text-sm font-semibold text-gray-200">{t('micTest.title')}</h3>
      <p className="text-xs text-gray-400">{t('micTest.hint')}</p>
      <div
        className="h-3 overflow-hidden rounded-full bg-surface"
        role="meter"
        aria-label={t('micTest.level')}
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.round((level / 100) * 60 - 60)}
      >
        <div
          className={`h-full transition-[width] duration-75 ${level > 95 ? 'bg-amber-400' : 'bg-green-500'}`}
          style={{ width: `${level}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={phase === 'starting'}
          className="min-h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-text disabled:opacity-50"
          onClick={() => {
            if (phase === 'recording') resources.current.recorder?.stop()
            else void start()
          }}
        >
          {t(phase === 'recording' ? 'micTest.stop' : phase === 'starting' ? 'microphoneStarting' : 'micTest.start')}
        </button>
        {phase === 'recording' && (
          <span role="status" className="text-xs text-gray-300">
            {t('micTest.recording')}
          </span>
        )}
      </div>
      {url && <audio ref={audioRef} controls src={url} className="h-10 w-full" aria-label={t('micTest.playback')} />}
      {error && (
        <p role="alert" className="text-xs text-amber-200">
          {error}
        </p>
      )}
    </section>
  )
}
