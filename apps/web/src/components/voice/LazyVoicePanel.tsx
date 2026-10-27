import { lazy, Suspense } from 'react'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'

const Panel = lazy(() => import('./VoicePanel').then(m => ({ default: m.VoicePanel })))

/** Keep voice controls and the SDK out of the offline chat shell. */
export function VoicePanel(props: { onGoToVoiceRoom?: () => void }) {
  const needed = useVoiceConnectionStore(s => !!s.currentChannelId || !!s.voiceNetworkDropout)
  return needed ? <Suspense fallback={null}><Panel {...props} /></Suspense> : null
}
