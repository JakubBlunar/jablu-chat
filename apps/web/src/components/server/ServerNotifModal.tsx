import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useNotifPrefStore, type NotifLevel } from '@/stores/notifPref.store'
import { useChannelStore } from '@/stores/channel.store'

const LEVELS: { value: NotifLevel; labelKey: string; descriptionKey: string }[] = [
  { value: 'all', labelKey: 'notifications.allMessages', descriptionKey: 'notifications.allMessagesDescription' },
  { value: 'mentions', labelKey: 'notifications.mentionsOnly', descriptionKey: 'notifications.mentionsDescription' },
  { value: 'none', labelKey: 'notifications.nothing', descriptionKey: 'notifications.nothingDescription' }
]

export function ServerNotifModal({ serverId, serverName, onClose }: { serverId: string; serverName: string; onClose: () => void }) {
  const { t } = useTranslation('server')
  const getServerLevel = useNotifPrefStore((s) => s.getServerLevel)
  const setServerPref = useNotifPrefStore((s) => s.setServer)
  const removeServerPref = useNotifPrefStore((s) => s.removeServer)
  const channelPrefs = useNotifPrefStore((s) => s.prefs)
  const setChannelPref = useNotifPrefStore((s) => s.set)
  const removeChannelPref = useNotifPrefStore((s) => s.remove)
  const channels = useChannelStore((s) => s.channels)
  const textChannels = channels.filter((c) => c.type === 'text')

  const [serverLevel, setServerLevel] = useState<NotifLevel>(getServerLevel(serverId))
  const [channelOverrides, setChannelOverrides] = useState<Record<string, NotifLevel | 'default'>>({})

  useEffect(() => {
    const overrides: Record<string, NotifLevel | 'default'> = {}
    for (const ch of textChannels) {
      overrides[ch.id] = channelPrefs[ch.id] ?? 'default'
    }
    setChannelOverrides(overrides)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId])

  const handleServerLevelChange = useCallback(
    async (level: NotifLevel) => {
      const prev = serverLevel
      setServerLevel(level)
      try {
        if (level === 'all') {
          await api.resetServerNotifPref(serverId)
          removeServerPref(serverId)
        } else {
          await api.setServerNotifPref(serverId, level)
          setServerPref(serverId, level)
        }
      } catch {
        setServerLevel(prev)
      }
    },
    [serverId, serverLevel, setServerPref, removeServerPref]
  )

  const handleChannelOverride = useCallback(
    async (channelId: string, value: NotifLevel | 'default') => {
      const prev = channelOverrides[channelId]
      setChannelOverrides((s) => ({ ...s, [channelId]: value }))
      try {
        if (value === 'default') {
          await api.resetNotifPref(channelId)
          removeChannelPref(channelId)
        } else {
          await api.setNotifPref(channelId, value)
          setChannelPref(channelId, value)
        }
      } catch {
        setChannelOverrides((s) => ({ ...s, [channelId]: prev }))
      }
    },
    [channelOverrides, setChannelPref, removeChannelPref]
  )

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('notifications.title')}</h2>
          <p className="mt-0.5 text-sm text-gray-400">{serverName}</p>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t('notifications.serverDefault')}
          </label>
          <div className="space-y-1">
            {LEVELS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => void handleServerLevelChange(opt.value)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                  serverLevel === opt.value
                    ? 'bg-primary/10 ring-1 ring-primary/40'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-gray-500">
                  {serverLevel === opt.value && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <div>
                  <span className={`text-sm font-medium ${serverLevel === opt.value ? 'text-white' : 'text-gray-300'}`}>
                    {t(opt.labelKey)}
                  </span>
                  <p className="text-[11px] text-gray-500">{t(opt.descriptionKey)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {textChannels.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t('notifications.channelOverrides')}
            </label>
            <p className="text-[11px] text-gray-500">
              {t('notifications.channelOverridesDescription')}
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {textChannels.map((ch) => (
                <div key={ch.id} className="flex items-center justify-between rounded px-3 py-1.5 hover:bg-white/[0.04]">
                  <span className="text-sm text-gray-300"># {ch.name}</span>
                  <select
                    value={channelOverrides[ch.id] ?? 'default'}
                    onChange={(e) => void handleChannelOverride(ch.id, e.target.value as NotifLevel | 'default')}
                    className="rounded border border-white/10 bg-surface-darkest px-2 py-1 text-xs text-white outline-none"
                  >
                    <option value="default">{t('notifications.default')}</option>
                    <option value="all">{t('notifications.allMessages')}</option>
                    <option value="mentions">{t('notifications.mentions')}</option>
                    <option value="none">{t('notifications.muted')}</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}
