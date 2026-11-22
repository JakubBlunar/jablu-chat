import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useIsMobile } from '@/hooks/useMobile'
import { MobileSettingsShell } from '@/components/settings/MobileSettingsShell'
import type { Server } from '@/stores/server.store'
import { SERVER_TABS, type Tab } from './server-settings/serverSettingsTypes'
import { XIcon } from './server-settings/serverSettingsIcons'
import { BansTab } from './server-settings/tabs/BansTab'
import { OverviewTab } from './server-settings/tabs/OverviewTab'
import { RolesTab } from './server-settings/tabs/RolesTab'
import { MembersTab } from './server-settings/tabs/MembersTab'
import { WebhooksTab } from './server-settings/tabs/WebhooksTab'
import { BotsTab } from './server-settings/tabs/BotsTab'
import { EmojiStatsTab } from './server-settings/tabs/EmojiStatsTab'
import { AutoModTab } from './server-settings/tabs/AutoModTab'
import { AuditLogTab } from './server-settings/tabs/AuditLogTab'
import { InsightsTab } from './server-settings/tabs/InsightsTab'
import { OnboardingTab } from './server-settings/tabs/OnboardingTab'
import { DangerTab } from './server-settings/tabs/DangerTab'
import { WelcomeTab } from './server-settings/tabs/WelcomeTab'
import { AfkTab } from './server-settings/tabs/AfkTab'
import { LevelingTab } from './server-settings/tabs/LevelingTab'

const settingGroups = {
  general: ['overview', 'welcome', 'onboarding', 'afk', 'leveling'],
  people: ['members', 'roles', 'bans', 'automod'],
  integrations: ['webhooks', 'bots', 'emoji-stats'],
  management: ['audit', 'insights', 'danger']
} satisfies Record<string, Tab[]>

export function ServerSettingsModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const { t: tNav } = useTranslation('nav')
  const { t: tServerSettings } = useTranslation('server-settings')
  const { t: tCommon } = useTranslation('common')
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState('')
  const isMobile = useIsMobile()
  const matchesFilter = (key: Tab) =>
    tServerSettings('tabs.' + key)
      .toLocaleLowerCase()
      .includes(filter.toLocaleLowerCase().trim())
  const currentLabel = tServerSettings(`tabs.${tab}`)

  const tabContent = (
    <>
      {tab === 'overview' && <OverviewTab server={server} />}
      {tab === 'welcome' && <WelcomeTab server={server} />}
      {tab === 'afk' && <AfkTab server={server} />}
      {tab === 'roles' && <RolesTab server={server} />}
      {tab === 'members' && <MembersTab server={server} />}
      {tab === 'bans' && <BansTab server={server} />}
      {tab === 'webhooks' && <WebhooksTab server={server} />}
      {tab === 'bots' && <BotsTab server={server} />}
      {tab === 'emoji-stats' && <EmojiStatsTab server={server} />}
      {tab === 'automod' && <AutoModTab server={server} />}
      {tab === 'audit' && <AuditLogTab server={server} />}
      {tab === 'insights' && <InsightsTab server={server} />}
      {tab === 'onboarding' && <OnboardingTab server={server} />}
      {tab === 'leveling' && <LevelingTab server={server} />}
      {tab === 'danger' && <DangerTab server={server} onClose={onClose} />}
    </>
  )

  if (isMobile) {
    return (
      <MobileSettingsShell
        title={tNav('serverSettings')}
        detailTitle={currentLabel}
        tab={tab}
        closeLabel={tNav('closeServerSettings')}
        backLabel={tCommon('back')}
        onClose={onClose}
        className="fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        index={(openDetail) => (
          <div className="p-3">
            <input
              type="search"
              aria-label={tServerSettings('findSetting')}
              placeholder={tServerSettings('findSetting')}
              className="mb-3 w-full rounded bg-surface-darkest p-3"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {Object.entries(settingGroups).map(([name, tabs]) => {
              const visible = tabs.filter(matchesFilter)
              if (!visible.length) return null
              return (
                <section key={name}>
                  <h2 className="mt-3 px-3 text-xs font-semibold text-gray-400">
                    {tServerSettings('indexGroups.' + name)}
                  </h2>
                  {visible.map((key) => (
                    <button
                      type="button"
                      key={key}
                      data-settings-key={key}
                      className="block min-h-11 w-full rounded px-3 text-left hover:bg-white/10"
                      onClick={() => {
                        setTab(key)
                        openDetail()
                      }}
                    >
                      {tServerSettings('tabs.' + key)}
                    </button>
                  ))}
                </section>
              )
            })}
            {!SERVER_TABS.some(matchesFilter) && (
              <p role="status" className="p-3 text-sm text-gray-400">
                {tServerSettings('lists.noResults')}
              </p>
            )}
          </div>
        )}
      >
        <div className="p-4">{tabContent}</div>
      </MobileSettingsShell>
    )
  }

  return (
    <ModalOverlay
      onClose={onClose}
      maxWidth="max-w-[960px]"
      noPadding
      aria-label={tNav('serverSettings')}
      dialogBodyScroll={false}
      className="flex h-[80vh] min-h-0"
    >
      <SimpleBar className="w-44 shrink-0 bg-surface-darkest p-3">
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {tNav('serverSettings')}
        </h2>
        <nav className="flex flex-col gap-0.5">
          {SERVER_TABS.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setTab(tabKey)}
              className={`rounded-md px-2 py-1.5 text-left text-sm transition ${
                tab === tabKey
                  ? 'bg-surface-selected text-white'
                  : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {tServerSettings(`tabs.${tabKey}`)}
            </button>
          ))}
        </nav>
      </SimpleBar>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
          <h1 className="text-lg font-semibold text-white">{currentLabel}</h1>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 transition hover:text-white"
            aria-label={tCommon('close')}
          >
            <XIcon />
          </button>
        </div>

        <SimpleBar className="min-h-0 flex-1 p-6">{tabContent}</SimpleBar>
      </div>
    </ModalOverlay>
  )
}
