import type { CreateEventInput, EventLocationType, RecurrenceRule } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { Button, IconButton, Input, Textarea } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useEventStore } from '@/stores/event.store'

type Step = 'location' | 'details' | 'review'

type Props = {
  serverId: string
  onClose: () => void
  onBack: () => void
}

function toLocalDatetimeString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

function formatPreviewTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function CreateEventWizard({ serverId, onClose, onBack }: Props) {
  const channels = useChannelStore((s) => s.channels)
  const voiceChannels = channels.filter((c) => c.type === 'voice')

  const [step, setStep] = useState<Step>('location')
  const [locationType, setLocationType] = useState<EventLocationType>('voice_channel')
  const [channelId, setChannelId] = useState(voiceChannels[0]?.id ?? '')
  const [locationText, setLocationText] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    return toLocalDatetimeString(d)
  })
  const [endAt, setEndAt] = useState('')
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | ''>('')

  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (voiceChannels.length > 0 && !channelId) {
      setChannelId(voiceChannels[0].id)
    }
  }, [voiceChannels, channelId])

  const handleSubmit = useCallback(async () => {
    setError(null)
    setSubmitting(true)

    const input: CreateEventInput = {
      name: name.trim(),
      locationType,
      startAt: new Date(startAt).toISOString(),
      ...(description.trim() && { description: description.trim() }),
      ...(locationType === 'voice_channel' && channelId && { channelId }),
      ...(locationType === 'custom' && locationText.trim() && { locationText: locationText.trim() }),
      ...(endAt && { endAt: new Date(endAt).toISOString() }),
      ...(recurrenceRule && { recurrenceRule: recurrenceRule as RecurrenceRule })
    }

    try {
      const event = await api.createServerEvent(serverId, input)
      useEventStore.getState().addEvent(event)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create event')
    } finally {
      setSubmitting(false)
    }
  }, [serverId, name, description, locationType, channelId, locationText, startAt, endAt, recurrenceRule, onClose])

  const canAdvanceToDetails =
    locationType === 'voice_channel' ? !!channelId : locationText.trim().length > 0
  const canAdvanceToReview = name.trim().length > 0 && !!startAt

  return (
    <ModalOverlay onClose={onClose} noPadding className="flex max-h-[85vh] flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            label="Back"
            onClick={step === 'location' ? onBack : () => setStep(step === 'review' ? 'details' : 'location')}
            size="lg"
            className="rounded-lg p-1"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </IconButton>
          <h2 className="text-base font-bold text-white">
            {step === 'location' ? 'Choose Location' : step === 'details' ? 'Event Details' : 'Review'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {(['location', 'details', 'review'] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 w-6 rounded-full transition ${
                s === step ? 'bg-primary' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {step === 'location' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 p-3 transition hover:border-white/10">
                <input
                  type="radio"
                  name="locationType"
                  checked={locationType === 'voice_channel'}
                  onChange={() => setLocationType('voice_channel')}
                  className="accent-primary"
                />
                <div>
                  <div className="text-sm font-medium text-white">Voice Channel</div>
                  <div className="text-xs text-gray-400">Host the event in a voice channel</div>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/5 p-3 transition hover:border-white/10">
                <input
                  type="radio"
                  name="locationType"
                  checked={locationType === 'custom'}
                  onChange={() => setLocationType('custom')}
                  className="accent-primary"
                />
                <div>
                  <div className="text-sm font-medium text-white">Somewhere Else</div>
                  <div className="text-xs text-gray-400">Add a link or custom location</div>
                </div>
              </label>
            </div>

            {locationType === 'voice_channel' && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-400">Voice Channel</label>
                <select
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-surface-dark px-3 py-2 text-sm text-white outline-none focus:border-primary"
                >
                  {voiceChannels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {locationType === 'custom' && (
              <Input
                id="create-event-location"
                label="Location"
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g., Discord stage, external link..."
                maxLength={200}
                className="rounded-lg ring-white/10 focus:ring-primary"
              />
            )}
          </div>
        )}

        {step === 'details' && (
          <div className="space-y-4">
            <Input
              id="create-event-name"
              label="Event Name *"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Game Night, Movie Watch Party..."
              maxLength={100}
              className="rounded-lg ring-white/10 focus:ring-primary"
            />

            <Textarea
              id="create-event-description"
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell people what this event is about..."
              maxLength={1000}
              rows={3}
              className="rounded-lg ring-white/10 focus:ring-primary"
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                id="create-event-start"
                label="Start *"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="rounded-lg ring-white/10 focus:ring-primary"
              />
              <Input
                id="create-event-end"
                label="End (optional)"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                min={startAt}
                className="rounded-lg ring-white/10 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-400">Repeat</label>
              <select
                value={recurrenceRule}
                onChange={(e) => setRecurrenceRule(e.target.value as RecurrenceRule | '')}
                className="w-full rounded-lg border border-white/10 bg-surface-dark px-3 py-2 text-sm text-white outline-none focus:border-primary"
              >
                <option value="">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/5 bg-surface-light/50 p-4">
              <h3 className="text-base font-bold text-white">{name}</h3>
              {description && <p className="mt-1 text-sm text-gray-400">{description}</p>}

              <div className="mt-3 space-y-2 text-xs text-gray-400">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{formatPreviewTime(new Date(startAt).toISOString())}</span>
                  {endAt && <span>- {formatPreviewTime(new Date(endAt).toISOString())}</span>}
                </div>

                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>
                    {locationType === 'voice_channel'
                      ? voiceChannels.find((c) => c.id === channelId)?.name ?? 'Voice Channel'
                      : locationText || 'Custom location'}
                  </span>
                </div>

                {recurrenceRule && (
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Repeats {recurrenceRule}</span>
                  </div>
                )}
              </div>
            </div>

            {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
        {step === 'location' && (
          <Button type="button" onClick={() => setStep('details')} disabled={!canAdvanceToDetails} className="rounded-lg">
            Next
          </Button>
        )}
        {step === 'details' && (
          <Button type="button" onClick={() => setStep('review')} disabled={!canAdvanceToReview} className="rounded-lg">
            Review
          </Button>
        )}
        {step === 'review' && (
          <Button type="button" onClick={handleSubmit} disabled={submitting} className="rounded-lg">
            {submitting ? 'Creating...' : 'Create Event'}
          </Button>
        )}
      </div>
    </ModalOverlay>
  )
}
