import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDmCallStore } from '@/stores/dmCall.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

export function DmCallButton({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation('voice')
  const { t: tCommon } = useTranslation('common')
  const calls = useDmCallStore((s) => s.calls)
  const busy = useDmCallStore((s) => s.busy)
  const currentCallId = useVoiceConnectionStore((s) => s.currentDmCallId)
  const voiceChannelId = useVoiceConnectionStore((s) => s.currentChannelId)
  const viewing = useVoiceConnectionStore((s) => s.viewingVoiceRoom)
  const [confirm, setConfirm] = useState(false)
  const call = Object.values(calls).find((call) => call.conversationId === conversationId)
  const isCurrent = !!call && call.id === currentCallId
  const label = isCurrent ? (viewing ? t('backToMessages') : t('goToVoiceRoom')) : call ? t('joinCall') : t('startCall')
  const run = () => {
    setConfirm(false)
    if (isCurrent) useVoiceConnectionStore.getState().setViewingVoiceRoom(!viewing)
    else if (call) void useDmCallStore.getState().accept(call)
    else void useDmCallStore.getState().start(conversationId)
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={busy}
        onClick={() => {
          if (voiceChannelId && !isCurrent) setConfirm(true)
          else run()
        }}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50 ${call ? 'text-green-400 hover:bg-green-500/10' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
        </svg>
      </button>
      {confirm && (
        <ConfirmDialog
          title={t('switchCallTitle')}
          description={t('switchCallHint')}
          confirmLabel={t('continueCall')}
          cancelLabel={tCommon('cancel')}
          onConfirm={run}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}
