import { useEffect, useState } from 'react'
import { RoomEvent, Track } from 'livekit-client'
import { useTranslation } from 'react-i18next'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { summarizeVoiceStats, type VoiceDiagnostics as Metrics, type VoiceStatsHistory } from '@/lib/voiceDiagnostics'

export function VoiceDiagnostics() {
  const { t } = useTranslation('voice')
  const room = useVoiceConnectionStore((s) => s.room)
  const [open, setOpen] = useState(false)
  const [quality, setQuality] = useState('unknown')
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  useEffect(() => {
    if (!room) return
    const update = () => setQuality(room.localParticipant.connectionQuality)
    update()
    room.on(RoomEvent.ConnectionQualityChanged, update)
    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, update)
    }
  }, [room])
  useEffect(() => {
    setMetrics(null)
    if (!room || !open) return
    let active = true,
      busy = false
    let history: VoiceStatsHistory = new Map()
    const sample = async () => {
      if (busy) return
      busy = true
      try {
        const tracks = [room.localParticipant, ...room.remoteParticipants.values()]
          .map((p) => p.getTrackPublication(Track.Source.Microphone)?.track)
          .filter((track) => !!track)
        const reports = await Promise.all(tracks.map((track) => track.getRTCStatsReport()))
        if (!active) return
        const next = summarizeVoiceStats(
          reports.filter((report) => !!report),
          history
        )
        history = next.history
        setMetrics(next.metrics)
      } catch {
        if (active) setMetrics(null)
      } finally {
        busy = false
      }
    }
    void sample()
    const timer = setInterval(() => {
      void sample()
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [room, open])
  if (!room) return null
  const number = (value: number | null | undefined, unit: string) =>
    value == null ? '—' : `${value.toFixed(unit === '%' ? 1 : 0)} ${unit}`
  return (
    <div className="text-xs text-gray-300">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-2 text-left hover:bg-white/5"
      >
        <span>{t('diagnostics.title')}</span>
        <span className={quality === 'poor' || quality === 'lost' ? 'text-amber-300' : 'text-gray-400'}>
          {t(`diagnostics.quality.${quality}`)}
        </span>
      </button>
      {open && (
        <div className="space-y-2 rounded-md bg-surface-darkest p-3" aria-label={t('diagnostics.title')}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <dt>{t('diagnostics.latency')}</dt>
            <dd className="text-right tabular-nums">{number(metrics?.roundTripMs, 'ms')}</dd>
            <dt>{t('diagnostics.jitter')}</dt>
            <dd className="text-right tabular-nums">{number(metrics?.jitterMs, 'ms')}</dd>
            <dt>{t('diagnostics.loss')}</dt>
            <dd className="text-right tabular-nums">{number(metrics?.packetLossPercent, '%')}</dd>
            <dt>{t('diagnostics.bitrate')}</dt>
            <dd className="text-right tabular-nums">{number(metrics?.receiveKbps, 'kbps')}</dd>
            <dt>{t('diagnostics.transport')}</dt>
            <dd className="text-right">{metrics?.transport ?? '—'}</dd>
          </dl>
          <p className="text-[11px] text-gray-500">{t('diagnostics.hint')}</p>
        </div>
      )}
    </div>
  )
}
