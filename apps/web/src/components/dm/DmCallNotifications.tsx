import { useEffect, useRef } from 'react'
import { getDmCallUrl } from '@chat/shared'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { clearNotifications, showNotification } from '@/lib/notifications'
import { playNotifSound } from '@/lib/sounds'
import { useAuthStore } from '@/stores/auth.store'
import { useDmCallStore } from '@/stores/dmCall.store'
import { useDmStore } from '@/stores/dm.store'
import { getDmDisplayInfo } from '@/lib/dmDisplay'
import { useSettingsStore } from '@/stores/settings.store'
import { useLayoutStore } from '@/stores/layout.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function DmCallNotifications() {
  const { t } = useTranslation('voice')
  const { t: tCommon } = useTranslation('common')
  const { goToDm } = useAppNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const isDnd = useAuthStore((s) => s.user?.status === 'dnd')
  const calls = useDmCallStore((s) => s.calls)
  const conversations = useDmStore((s) => s.conversations)
  const busy = useDmCallStore((s) => s.busy)
  const error = useDmCallStore((s) => s.error)
  const soundEnabled = useSettingsStore((s) => s.notifSoundEnabled)
  const notificationsEnabled = useSettingsStore((s) => s.notifEnabled)
  const currentCallId = useVoiceConnectionStore((s) => s.currentDmCallId)
  const voiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const mutedIds = new Set(conversations.filter((conversation) => conversation.muted).map((conversation) => conversation.id))
  const incoming = Object.values(calls).filter((call) => userId && call.ringingUserIds.includes(userId) && !mutedIds.has(call.conversationId))
  const ringingIds = incoming.map((call) => call.id).join(',')
  const groupNames = new Map(
    conversations
      .filter((conversation) => conversation.isGroup)
      .map((conversation) => [conversation.id, getDmDisplayInfo(conversation, userId).name])
  )
  const notified = useRef(new Map<string, string>())
  const outgoing = currentCallId ? calls[currentCallId] : undefined
  const calling = outgoing && outgoing.participants.length === 1 && outgoing.ringingUserIds.length > 0

  useEffect(() => {
    const ringing = new Set(ringingIds.split(','))
    const current = useDmCallStore.getState().calls
    for (const call of Object.values(current)) {
      if (userId && call.ringingUserIds.includes(userId) && !useDmStore.getState().conversations.some((conversation) => conversation.id === call.conversationId && conversation.muted) && !notified.current.has(call.id)) {
        const url = getDmCallUrl(call.conversationId, call.id)
        notified.current.set(call.id, url)
        if (!isDnd)
          showNotification(t('incomingCall'), t('callerRinging', { name: call.callerName }), url, undefined, 'friend')
      }
    }
    for (const [id, url] of notified.current) {
      if (!ringing.has(id)) {
        void clearNotifications([url])
        notified.current.delete(id)
      }
    }
    if (!ringingIds || !soundEnabled || !notificationsEnabled || isDnd) return
    const interval = setInterval(() => playNotifSound('friend'), 4000)
    return () => clearInterval(interval)
  }, [ringingIds, userId, soundEnabled, notificationsEnabled, isDnd, t])

  if (!incoming.length && !error && !calling) return null

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[110] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
    >
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-surface-dark p-3 shadow-xl">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            className="mt-2 text-xs text-gray-300"
            onClick={() => useDmCallStore.getState().clearError()}
          >
            {tCommon('dismiss')}
          </button>
        </div>
      )}
      {incoming.map((call) => (
        <section
          key={call.id}
          role="dialog"
          aria-label={t('incomingCall')}
          className="rounded-lg border border-green-500/40 bg-surface-dark p-4 text-white shadow-xl"
        >
          <p className="text-sm font-semibold">{t('incomingCall')}</p>
          <p className="mt-1 text-sm text-gray-300">{t('callerRinging', { name: call.callerName })}</p>
          {groupNames.has(call.conversationId) && (
            <p className="mt-1 truncate text-xs text-gray-400">{groupNames.get(call.conversationId)}</p>
          )}
          {voiceChannelId && <p className="mt-2 text-xs text-amber-300">{t('switchCallHint')}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded bg-green-600 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => {
                void useDmCallStore
                  .getState()
                  .accept(call)
                  .then((joined) => {
                    if (joined) {
                      goToDm(call.conversationId)
                      useLayoutStore.getState().closeNavDrawer()
                    }
                  })
              }}
            >
              {t('acceptCall')}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded bg-red-600 px-3 py-2 text-sm disabled:opacity-50"
              onClick={() => {
                void useDmCallStore.getState().decline(call.id)
              }}
            >
              {t('declineCall')}
            </button>
          </div>
        </section>
      ))}
      {calling && (
        <div role="status" className="rounded-lg border border-white/10 bg-surface-dark p-3 text-white shadow-xl">
          <p className="text-sm">{t('calling')}</p>
          <button
            type="button"
            className="mt-2 text-sm text-red-400"
            onClick={() => useVoiceConnectionStore.getState().disconnect()}
          >
            {t('cancelCall')}
          </button>
        </div>
      )}
    </div>,
    document.body
  )
}
