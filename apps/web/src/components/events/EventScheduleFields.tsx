import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui'
import {
  DURATION_PRESETS,
  addMinutesToLocalISO,
  diffMinutes,
  isoToLocalDatetimeString,
  localToISO
} from '@/lib/eventDuration'

type Mode = 'duration' | 'end'
type DurationSel = number | 'none' | 'custom'

function deriveInitial(startLocal: string, endISO: string | null): {
  mode: Mode
  durationSel: DurationSel
  customH: number
  customM: number
  endLocal: string
} {
  if (!endISO) {
    return { mode: 'duration', durationSel: 'none', customH: 1, customM: 0, endLocal: '' }
  }
  const startISO = localToISO(startLocal)
  const endLocal = isoToLocalDatetimeString(endISO)
  if (!startISO) {
    return { mode: 'end', durationSel: 'none', customH: 1, customM: 0, endLocal }
  }
  const minutes = diffMinutes(startISO, endISO)
  const preset = DURATION_PRESETS.find((p) => p.minutes === minutes)
  if (preset) {
    return { mode: 'duration', durationSel: preset.minutes, customH: 1, customM: 0, endLocal }
  }
  if (minutes > 0) {
    return {
      mode: 'duration',
      durationSel: 'custom',
      customH: Math.floor(minutes / 60),
      customM: minutes % 60,
      endLocal
    }
  }
  return { mode: 'end', durationSel: 'none', customH: 1, customM: 0, endLocal }
}

/**
 * Start datetime + a Duration/End-time toggle. Reports the start (local
 * `datetime-local` value) and the resolved end as an ISO instant (or null).
 */
export function EventScheduleFields({
  startLocal,
  onStartChange,
  endISO,
  onEndChange
}: {
  startLocal: string
  onStartChange: (v: string) => void
  endISO: string | null
  onEndChange: (iso: string | null) => void
}) {
  const initial = useRef(deriveInitial(startLocal, endISO))
  const [mode, setMode] = useState<Mode>(initial.current.mode)
  const [durationSel, setDurationSel] = useState<DurationSel>(initial.current.durationSel)
  const [customH, setCustomH] = useState(initial.current.customH)
  const [customM, setCustomM] = useState(initial.current.customM)
  const [endLocal, setEndLocal] = useState(initial.current.endLocal)

  // Resolve the effective end instant whenever any input changes and report it up.
  const lastEmitted = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    let resolved: string | null
    if (mode === 'end') {
      resolved = localToISO(endLocal)
    } else if (durationSel === 'none') {
      resolved = null
    } else if (durationSel === 'custom') {
      const minutes = Math.max(0, customH * 60 + customM)
      resolved = minutes > 0 ? addMinutesToLocalISO(startLocal, minutes) : null
    } else {
      resolved = addMinutesToLocalISO(startLocal, durationSel)
    }
    if (resolved !== lastEmitted.current) {
      lastEmitted.current = resolved
      onEndChange(resolved)
    }
  }, [mode, durationSel, customH, customM, endLocal, startLocal, onEndChange])

  return (
    <div className="space-y-3">
      <Input
        id="event-start"
        label="Start *"
        type="datetime-local"
        value={startLocal}
        onChange={(e) => onStartChange(e.target.value)}
        className="rounded-lg ring-white/10 focus:ring-primary"
      />

      <div>
        <div className="mb-1 flex items-center gap-1">
          <label className="text-xs font-medium text-gray-400">Ends</label>
          <div className="ml-auto flex rounded-lg bg-surface-dark p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('duration')}
              className={`rounded-md px-2 py-0.5 transition ${
                mode === 'duration' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Duration
            </button>
            <button
              type="button"
              onClick={() => setMode('end')}
              className={`rounded-md px-2 py-0.5 transition ${
                mode === 'end' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              End time
            </button>
          </div>
        </div>

        {mode === 'duration' ? (
          <div className="space-y-2">
            <select
              value={String(durationSel)}
              onChange={(e) => {
                const v = e.target.value
                setDurationSel(v === 'none' || v === 'custom' ? v : Number(v))
              }}
              className="w-full rounded-lg border border-white/10 bg-surface-dark px-3 py-2 text-sm text-white outline-none focus:border-primary"
            >
              <option value="none">No end time</option>
              {DURATION_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom...</option>
            </select>

            {durationSel === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={72}
                  value={customH}
                  onChange={(e) => setCustomH(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 rounded-lg border border-white/10 bg-surface-dark px-2 py-1.5 text-sm text-white outline-none focus:border-primary"
                />
                <span className="text-xs text-gray-400">hours</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={customM}
                  onChange={(e) => setCustomM(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-16 rounded-lg border border-white/10 bg-surface-dark px-2 py-1.5 text-sm text-white outline-none focus:border-primary"
                />
                <span className="text-xs text-gray-400">minutes</span>
              </div>
            )}
          </div>
        ) : (
          <Input
            id="event-end"
            type="datetime-local"
            value={endLocal}
            onChange={(e) => setEndLocal(e.target.value)}
            min={startLocal}
            className="rounded-lg ring-white/10 focus:ring-primary"
          />
        )}
      </div>
    </div>
  )
}
