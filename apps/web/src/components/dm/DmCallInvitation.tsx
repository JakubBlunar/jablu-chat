import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useDmCallStore } from '@/stores/dmCall.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { DmCallButton } from './DmCallButton'

export function DmCallInvitation({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('voice')
  const { t: tCommon } = useTranslation('common')
  const [params, setParams] = useSearchParams()
  const callId = params.get('call')
  const call = useDmCallStore((s) => (callId ? s.calls[callId] : undefined))
  const syncStatus = useDmCallStore((s) => s.syncStatus)
  const sync = useDmCallStore((s) => s.sync)
  const userId = useAuthStore((s) => s.user?.id)
  const currentCallId = useVoiceConnectionStore((s) => s.currentDmCallId)

  useEffect(() => {
    if (callId && getSocket()?.connected) void sync()
  }, [callId, conversationId, sync])

  if (!callId || currentCallId === callId) return null

  const loading = syncStatus === 'idle' || syncStatus === 'loading'
  const activeCall = call?.conversationId === conversationId ? call : undefined
  const onAnotherDevice = activeCall?.participants.some((participant) => participant.userId === userId)
  const message = loading
    ? t('checkingCall')
    : syncStatus === 'error'
      ? t('checkCallFailed')
      : !activeCall
        ? t('callEnded')
        : onAnotherDevice
          ? t('callOnAnotherDevice')
          : t('callStillActive')

  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-surface-dark px-4 py-2"
    >
      <p className="min-w-0 flex-1 text-sm text-gray-300">{message}</p>
      {!loading && syncStatus === 'ready' && activeCall && !onAnotherDevice && (
        <DmCallButton conversationId={conversationId} callId={callId} />
      )}
      {syncStatus === 'error' && (
        <button
          type="button"
          className="rounded px-2 py-1 text-sm text-primary hover:bg-white/10"
          onClick={() => {
            void sync()
          }}
        >
          {tCommon('retry')}
        </button>
      )}
      <button
        type="button"
        className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
        onClick={() =>
          setParams(
            (previous) => {
              const next = new URLSearchParams(previous)
              next.delete('call')
              return next
            },
            { replace: true }
          )
        }
      >
        {tCommon('dismiss')}
      </button>
    </div>
  )
}
