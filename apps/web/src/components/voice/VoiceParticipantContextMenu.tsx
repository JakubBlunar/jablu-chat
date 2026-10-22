import { useRef, type HTMLAttributes, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu'
import { useAuthStore } from '@/stores/auth.store'
import { useVoiceConnectionStore } from '@/stores/voice-connection.store'
import { useSettingsStore } from '@/stores/settings.store'

export function VoiceParticipantContextMenu({
  userId,
  channelId,
  name,
  children,
  openOnClick = false
}: {
  userId: string
  channelId: string
  name: string
  children: ReactElement<HTMLAttributes<HTMLElement>>
  openOnClick?: boolean
}) {
  const { t } = useTranslation('voice')
  const { t: tp } = useTranslation('profile')
  const self = useAuthStore((s) => s.user?.id === userId)
  const connectedChannel = useVoiceConnectionStore((s) => s.currentChannelId)
  const muted = useVoiceConnectionStore((s) => s.isMuted)
  const deafened = useVoiceConnectionStore((s) => s.isDeafened)
  const volume = useVoiceConnectionStore((s) => s.volumeOverrides[userId] ?? 100)
  const output = useSettingsStore((s) => s.voiceOutputVolume)
  const previousVolume = useRef(100)
  const canControl = connectedChannel === channelId
  const items: ContextMenuItem[] = self
    ? [
        {
          id: 'output',
          label: t('outputVolume'),
          disabled: !canControl,
          slider: {
            value: output,
            min: 0,
            max: 200,
            onChange: (value) => useSettingsStore.getState().setVoiceOutputVolume(value)
          }
        },
        {
          id: 'mute',
          label: t('mute'),
          checked: muted,
          disabled: !canControl,
          onSelect: () => useVoiceConnectionStore.getState().toggleMute()
        },
        {
          id: 'deafen',
          label: t('deafen'),
          checked: deafened,
          disabled: !canControl,
          onSelect: () => useVoiceConnectionStore.getState().toggleDeafen()
        }
      ]
    : [
        {
          id: 'volume',
          label: tp('voiceVolume'),
          disabled: !canControl,
          slider: {
            value: volume,
            min: 0,
            max: 200,
            onChange: (value) => useVoiceConnectionStore.getState().setVolumeOverride(userId, value)
          }
        },
        {
          id: 'mute-local',
          label: t('muteForMe'),
          disabled: !canControl,
          checked: volume === 0,
          onSelect: () => {
            if (volume > 0) previousVolume.current = volume
            useVoiceConnectionStore.getState().setVolumeOverride(userId, volume === 0 ? previousVolume.current : 0)
          }
        },
        {
          id: 'reset',
          label: tp('resetVolume'),
          disabled: !canControl || volume === 100,
          onSelect: () => useVoiceConnectionStore.getState().setVolumeOverride(userId, 100)
        }
      ]
  return (
    <ContextMenu label={name} items={items} openOnClick={openOnClick}>
      {children}
    </ContextMenu>
  )
}
