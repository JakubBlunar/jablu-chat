import type { ActivityDefaultSharing } from '@chat/shared'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ToggleRow } from '@/components/settings/ToggleRow'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Toggle } from '@/components/ui/Toggle'
import { useActivityStore } from '@/stores/activity.store'
import { useServerStore } from '@/stores/server.store'
import { resolveMediaUrl } from '@/lib/api'

const SHARING_OPTIONS: { value: ActivityDefaultSharing; labelKey: string; descriptionKey: string }[] = [
  {
    value: 'friends_all',
    labelKey: 'activity.friendsAllLabel',
    descriptionKey: 'activity.friendsAllDescription'
  },
  {
    value: 'friends_small',
    labelKey: 'activity.friendsSmallLabel',
    descriptionKey: 'activity.friendsSmallDescription'
  },
  {
    value: 'friends_only',
    labelKey: 'activity.friendsOnlyLabel',
    descriptionKey: 'activity.friendsOnlyDescription'
  }
]

export function ActivityPrivacySection() {
  const { t } = useTranslation('settings')
  const settings = useActivityStore((s) => s.settings)
  const fetchSettings = useActivityStore((s) => s.fetchSettings)
  const updateSettings = useActivityStore((s) => s.updateSettings)
  const hiddenServerIds = useActivityStore((s) => s.hiddenServerIds)
  const fetchServerPrefs = useActivityStore((s) => s.fetchServerPrefs)
  const setServerHidden = useActivityStore((s) => s.setServerHidden)
  const servers = useServerStore((s) => s.servers)

  useEffect(() => {
    if (!settings) void fetchSettings().catch(() => {})
  }, [settings, fetchSettings])

  useEffect(() => {
    void fetchServerPrefs().catch(() => {})
  }, [fetchServerPrefs])

  const shareEnabled = settings?.shareEnabled ?? false
  const shareGames = settings?.shareGames ?? true
  const shareMusic = settings?.shareMusic ?? true
  const shareOnline = settings?.shareOnline ?? false
  const defaultSharing = settings?.defaultSharing ?? 'friends_all'

  const set = (patch: Parameters<typeof updateSettings>[0]) => void updateSettings(patch).catch(() => {})
  const hiddenSet = new Set(hiddenServerIds)

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">{t('activity.intro')}</p>

      <ToggleRow
        label={t('activity.shareLabel')}
        description={t('activity.shareDescription')}
        checked={shareEnabled}
        onChange={() => set({ shareEnabled: !shareEnabled })}
      />

      <div className={shareEnabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-50'}>
        <SectionHeading>{t('activity.whatToShare')}</SectionHeading>
        <ToggleRow
          label={t('activity.gamesLabel')}
          description={t('activity.gamesDescription')}
          checked={shareGames}
          disabled={!shareEnabled}
          onChange={() => set({ shareGames: !shareGames })}
        />
        <ToggleRow
          label={t('activity.musicLabel')}
          description={t('activity.musicDescription')}
          checked={shareMusic}
          disabled={!shareEnabled}
          onChange={() => set({ shareMusic: !shareMusic })}
        />
      </div>

      <div className="space-y-3">
        <SectionHeading>{t('activity.whoCanSee')}</SectionHeading>
        <div className="space-y-2">
          {SHARING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => set({ defaultSharing: opt.value })}
              disabled={!shareEnabled}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition ${
                defaultSharing === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-white/10 bg-surface-dark hover:border-white/20'
              } ${shareEnabled ? '' : 'pointer-events-none opacity-50'}`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  defaultSharing === opt.value ? 'border-primary' : 'border-gray-500'
                }`}
              >
                {defaultSharing === opt.value && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-white">{t(opt.labelKey)}</span>
                <span className="block text-xs text-gray-400">{t(opt.descriptionKey)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={shareEnabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-50'}>
        <SectionHeading>{t('activity.perServerTitle')}</SectionHeading>
        <p className="text-xs text-gray-400">{t('activity.perServerDescription')}</p>
        {servers.length === 0 ? (
          <p className="rounded-lg bg-surface-dark px-4 py-3 text-sm text-gray-400">
            {t('activity.perServerEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {servers.map((server) => {
              const shared = !hiddenSet.has(server.id)
              const initial = server.name.charAt(0).toUpperCase()
              return (
                <div
                  key={server.id}
                  className="flex items-center justify-between rounded-lg bg-surface-dark px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-xs font-semibold text-white">
                      {server.iconUrl ? (
                        <img
                          src={resolveMediaUrl(server.iconUrl)}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        initial
                      )}
                    </span>
                    <span className="truncate text-sm font-medium text-white">{server.name}</span>
                  </div>
                  <Toggle
                    checked={shared}
                    disabled={!shareEnabled}
                    onChange={() => {
                      if (!shareEnabled) return
                      void setServerHidden(server.id, shared).catch(() => {})
                    }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <SectionHeading>{t('activity.notifications')}</SectionHeading>
        <ToggleRow
          label={t('activity.onlineLabel')}
          description={t('activity.onlineDescription')}
          checked={shareOnline}
          onChange={() => set({ shareOnline: !shareOnline })}
        />
      </div>
    </div>
  )
}
