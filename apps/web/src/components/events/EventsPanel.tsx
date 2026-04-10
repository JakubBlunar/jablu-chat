import type { ServerEvent } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, SectionHeading } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useEventStore } from '@/stores/event.store'
import { api } from '@/lib/api'
import { CreateEventWizard } from './CreateEventWizard'
import { EventDetail } from './EventDetail'

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

  if (days < 0) return `Started ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`
  if (days === 0) return `Today at ${time}`
  if (days === 1) return `Tomorrow at ${time}`
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`
}

function RecurrenceBadge({ rule }: { rule: string }) {
  const labels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly'
  }
  return (
    <Badge variant="primary" className="px-2 py-0.5 text-[10px] font-medium">
      {labels[rule] ?? rule}
    </Badge>
  )
}

function EventCard({
  event,
  onClick,
  onToggleInterest,
  onJoinVoice
}: {
  event: ServerEvent
  onClick: () => void
  onToggleInterest: () => void
  onJoinVoice?: () => void
}) {
  const isActive = event.status === 'active'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className="w-full cursor-pointer rounded-lg border border-white/5 bg-surface-light/50 p-3 text-left transition hover:border-white/10 hover:bg-surface-light"
    >
      {isActive && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-semibold text-emerald-400">HAPPENING NOW</span>
        </div>
      )}

      <h4 className="truncate text-sm font-semibold text-white">{event.name}</h4>

      <p className="mt-0.5 text-xs text-gray-400">{formatEventTime(event.startAt)}</p>

      {event.description && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">{event.description}</p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {event.locationType === 'voice_channel' && event.channelName && (
            <span
              role={onJoinVoice ? 'button' : undefined}
              tabIndex={onJoinVoice ? 0 : undefined}
              onClick={
                onJoinVoice
                  ? (e) => {
                      e.stopPropagation()
                      onJoinVoice()
                    }
                  : undefined
              }
              onKeyDown={
                onJoinVoice
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onJoinVoice()
                      }
                    }
                  : undefined
              }
              className={`flex items-center gap-1 text-[11px] ${
                onJoinVoice
                  ? 'cursor-pointer text-emerald-400 hover:text-emerald-300'
                  : 'text-gray-500'
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm5 8a1 1 0 0 0-2 0 3 3 0 1 1-6 0 1 1 0 0 0-2 0 5 5 0 0 0 4 4.9V17H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.1A5 5 0 0 0 17 9z" />
              </svg>
              {event.channelName}
            </span>
          )}
          {event.locationType === 'custom' && event.locationText && (
            <span className="text-[11px] text-gray-500">{event.locationText}</span>
          )}
          {event.recurrenceRule && <RecurrenceBadge rule={event.recurrenceRule} />}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleInterest()
            }}
            aria-pressed={!!event.isInterested}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
              event.isInterested
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            {event.isInterested ? 'Interested' : 'Interested?'}
            {event.interestedCount > 0 && (
              <span className="ml-0.5 opacity-70">{event.interestedCount}</span>
            )}
          </button>

          {isActive && event.locationType === 'voice_channel' && event.channelId && onJoinVoice && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onJoinVoice()
              }}
              className="flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-600/30"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M17 12a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V22h2v-3.07A7 7 0 0 0 19 12h-2z" />
              </svg>
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

type Props = {
  serverId: string
  onClose: () => void
}

export function EventsPanel({ serverId, onClose }: Props) {
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const events = useEventStore((s) => s.events)
  const loadedServerId = useEventStore((s) => s.loadedServerId)
  const isLoading = useEventStore((s) => s.isLoading)
  const hasMore = useEventStore((s) => s.hasMore)
  const fetchEvents = useEventStore((s) => s.fetchEvents)
  const fetchMore = useEventStore((s) => s.fetchMore)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    if (loadedServerId !== serverId) {
      fetchEvents(serverId)
    }
  }, [serverId, loadedServerId, fetchEvents])

  const handleToggleInterest = useCallback(
    async (eventId: string) => {
      try {
        const result = await api.toggleEventInterest(serverId, eventId)
        const ev = useEventStore.getState().events.find((e) => e.id === eventId)
        if (ev) {
          useEventStore.getState().updateEvent({ ...ev, isInterested: result.interested, interestedCount: result.count })
        }
      } catch {
        // ignore
      }
    },
    [serverId]
  )

  const handleJoinVoice = useCallback(
    (channelId: string, channelName: string | null) => {
      import('@/lib/voiceConnect').then(({ joinVoiceChannel }) =>
        joinVoiceChannel(serverId, channelId, channelName ?? 'Voice')
      )
      onClose()
    },
    [serverId, onClose]
  )

  const selectedEvent = events.find((e) => e.id === selectedEventId)

  if (selectedEvent) {
    return (
      <EventDetail
        event={selectedEvent}
        serverId={serverId}
        onBack={() => setSelectedEventId(null)}
        onClose={onClose}
      />
    )
  }

  if (showCreate) {
    return <CreateEventWizard serverId={serverId} onClose={() => setShowCreate(false)} onBack={() => setShowCreate(false)} />
  }

  const activeEvents = events.filter((e) => e.status === 'active')
  const scheduledEvents = events.filter((e) => e.status === 'scheduled')

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-lg" noPadding className="flex max-h-[70vh] flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <h2 className="text-lg font-bold text-white">{t('events')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-text transition hover:bg-primary/90"
          >
            {t('createEvent')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label={tCommon('close')}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading && events.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <svg className="mb-3 h-12 w-12 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-sm font-medium text-gray-400">No upcoming events</h3>
            <p className="mt-1 text-xs text-gray-500">Create an event to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeEvents.length > 0 && (
              <div className="space-y-2">
                {activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => setSelectedEventId(event.id)}
                    onToggleInterest={() => handleToggleInterest(event.id)}
                    onJoinVoice={
                      event.channelId
                        ? () => handleJoinVoice(event.channelId!, event.channelName ?? null)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {scheduledEvents.length > 0 && (
              <div className="space-y-2">
                {activeEvents.length > 0 && (
                  <SectionHeading as="h3" className="px-1">UPCOMING</SectionHeading>
                )}
                {scheduledEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => setSelectedEventId(event.id)}
                    onToggleInterest={() => handleToggleInterest(event.id)}
                    onJoinVoice={
                      event.channelId
                        ? () => handleJoinVoice(event.channelId!, event.channelName ?? null)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {hasMore && (
              <button
                type="button"
                onClick={() => fetchMore(serverId)}
                disabled={isLoading}
                className="w-full rounded-lg bg-white/5 py-2 text-xs font-medium text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}
