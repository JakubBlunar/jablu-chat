import type { ServerEvent, UpdateEventInput } from '@chat/shared'
import { Permission } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, IconButton, Input, Textarea } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useEventStore } from '@/stores/event.store'
import { UserAvatar } from '@/components/UserAvatar'

function formatFullTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

type Props = {
  event: ServerEvent
  serverId: string
  onBack: () => void
  onClose: () => void
}

export function EventDetail({ event, serverId, onBack, onClose }: Props) {
  const { t } = useTranslation('common')
  const userId = useAuthStore((s) => s.user?.id)

  const [interestedUsers, setInterestedUsers] = useState<
    { userId: string; user: { id: string; username: string; displayName: string | null; avatarUrl: string | null } }[]
  >([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showInterestedList, setShowInterestedList] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(event.name)
  const [editDescription, setEditDescription] = useState(event.description ?? '')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const isCreator = userId === event.creatorId
  const { has: hasPerm } = usePermissions(serverId)
  const canManage = isCreator || hasPerm(Permission.MANAGE_EVENTS)

  const fetchInterestedUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const users = await api.getEventInterestedUsers(serverId, event.id)
      setInterestedUsers(users)
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false)
    }
  }, [serverId, event.id])

  useEffect(() => {
    if (showInterestedList) {
      fetchInterestedUsers()
    }
  }, [showInterestedList, fetchInterestedUsers])

  const handleToggleInterest = useCallback(async () => {
    try {
      const result = await api.toggleEventInterest(serverId, event.id)
      useEventStore.getState().updateEvent({
        ...event,
        isInterested: result.interested,
        interestedCount: result.count
      })
      if (showInterestedList) fetchInterestedUsers()
    } catch {
      // ignore
    }
  }, [serverId, event, showInterestedList, fetchInterestedUsers])

  const handleSaveEdit = useCallback(async () => {
    setEditError(null)
    setSaving(true)
    try {
      const input: UpdateEventInput = {}
      if (editName.trim() !== event.name) input.name = editName.trim()
      if ((editDescription.trim() || null) !== event.description) input.description = editDescription.trim() || null
      if (Object.keys(input).length === 0) {
        setIsEditing(false)
        return
      }
      const updated = await api.updateServerEvent(serverId, event.id, input)
      useEventStore.getState().updateEvent(updated)
      setIsEditing(false)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }, [serverId, event, editName, editDescription])

  const handleCancelConfirmed = useCallback(async () => {
    setShowCancelConfirm(false)
    setCancelling(true)
    try {
      await api.cancelServerEvent(serverId, event.id)
      useEventStore.getState().removeEvent(event.id)
      onBack()
    } catch {
      setCancelling(false)
    }
  }, [serverId, event.id, onBack])

  const handleJoinVoice = useCallback(() => {
    if (event.channelId) {
      const chName = event.channelName ?? 'Voice'
      import('@/lib/voiceConnect').then(({ joinVoiceChannel }) =>
        joinVoiceChannel(serverId, event.channelId!, chName)
      )
    }
    onClose()
  }, [serverId, event.channelId, event.channelName, onClose])

  const isActive = event.status === 'active'

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-lg" noPadding className="flex max-h-[85vh] flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            label="Back to events"
            onClick={onBack}
            size="lg"
            className="rounded-lg p-1"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </IconButton>
          <h2 className="text-base font-bold text-white">Event Details</h2>
        </div>
        <IconButton type="button" label={t('close')} onClick={onClose} size="lg" className="rounded-lg">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isActive && (
          <div className="mb-3 flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-400">HAPPENING NOW</span>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-3">
            <Input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={100}
              className="rounded-lg font-semibold ring-white/10 focus:ring-primary"
            />
            <Textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Description..."
              className="rounded-lg ring-white/10 focus:ring-primary"
            />
            {editError && <div className="rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-400">{editError}</div>}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveEdit}
                disabled={saving || !editName.trim()}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsEditing(false)
                  setEditName(event.name)
                  setEditDescription(event.description ?? '')
                }}
                className="rounded-lg bg-white/5 hover:bg-white/10"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold text-white">{event.name}</h3>
            {event.description && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-400">{event.description}</p>}
          </>
        )}

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-start gap-3 text-gray-300">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <div>{formatFullTime(event.startAt)}</div>
              {event.endAt && <div className="text-xs text-gray-500">Ends: {formatFullTime(event.endAt)}</div>}
            </div>
          </div>

          <div className="flex items-center gap-3 text-gray-300">
            <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {event.locationType === 'voice_channel' && event.channelId ? (
              <button
                type="button"
                onClick={handleJoinVoice}
                className="text-emerald-400 transition hover:text-emerald-300 hover:underline"
              >
                {event.channelName ?? 'Voice Channel'}
              </button>
            ) : (
              <span>{event.locationText ?? 'Custom location'}</span>
            )}
          </div>

          {event.recurrenceRule && (
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <Badge variant="primary" className="capitalize">
                {event.recurrenceRule}
              </Badge>
            </div>
          )}

          {event.creator && (
            <div className="flex items-center gap-3 text-gray-300">
              <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Created by {event.creator.displayName ?? event.creator.username}</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={event.isInterested ? 'primary' : 'secondary'}
            onClick={handleToggleInterest}
            aria-pressed={!!event.isInterested}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 ${
              event.isInterested ? '' : 'bg-white/5 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            {event.isInterested ? 'Interested' : 'Mark Interested'}
          </Button>

          {isActive && event.locationType === 'voice_channel' && event.channelId && (
            <Button
              type="button"
              variant="primary"
              onClick={handleJoinVoice}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M17 12a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V22h2v-3.07A7 7 0 0 0 19 12h-2z" />
              </svg>
              Join Voice
            </Button>
          )}

          {canManage && !isEditing && (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditing(true)}
                className="rounded-lg bg-white/5 hover:bg-white/10"
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelling}
                className="rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300"
              >
                {cancelling ? 'Cancelling...' : 'Cancel Event'}
              </Button>
            </>
          )}
        </div>

        <div className="mt-5 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={() => setShowInterestedList(!showInterestedList)}
            aria-expanded={showInterestedList}
            aria-controls="interested-users-list"
            className="flex items-center gap-2 text-sm font-medium text-gray-300 transition hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
            {event.interestedCount} interested
            <svg
              className={`h-3 w-3 transition ${showInterestedList ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showInterestedList && (
            <div id="interested-users-list" className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {loadingUsers ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-8 animate-pulse rounded bg-white/5" />
                  ))}
                </div>
              ) : interestedUsers.length === 0 ? (
                <p className="text-xs text-gray-500">No one has marked interest yet</p>
              ) : (
                interestedUsers.map((item) => (
                  <div key={item.userId} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <UserAvatar
                      avatarUrl={item.user.avatarUrl}
                      username={item.user.username}
                      size="sm"
                    />
                    <span className="text-sm text-gray-300">
                      {item.user.displayName ?? item.user.username}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel Event"
          description="Are you sure you want to cancel this event?"
          confirmLabel="Cancel Event"
          onConfirm={handleCancelConfirmed}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </ModalOverlay>
  )
}
