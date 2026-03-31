import { useState } from 'react'
import SimpleBar from 'simplebar-react'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useIsMobile } from '@/hooks/useMobile'
import type { Server } from '@/stores/server.store'
import { SERVER_TABS, type Tab } from './server-settings/serverSettingsTypes'
import { XIcon } from './server-settings/serverSettingsIcons'
import { BansTab } from './server-settings/tabs/BansTab'
import { OverviewTab } from './server-settings/tabs/OverviewTab'
import { RolesTab } from './server-settings/tabs/RolesTab'
import { MembersTab } from './server-settings/tabs/MembersTab'
import { WebhooksTab } from './server-settings/tabs/WebhooksTab'
import { EmojiStatsTab } from './server-settings/tabs/EmojiStatsTab'
import { AutoModTab } from './server-settings/tabs/AutoModTab'
import { AuditLogTab } from './server-settings/tabs/AuditLogTab'
import { InsightsTab } from './server-settings/tabs/InsightsTab'
import { OnboardingTab } from './server-settings/tabs/OnboardingTab'
import { DangerTab } from './server-settings/tabs/DangerTab'
import { WelcomeTab } from './server-settings/tabs/WelcomeTab'
import { AfkTab } from './server-settings/tabs/AfkTab'

export function ServerSettingsModal({ server, onClose }: { server: Server; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const isMobile = useIsMobile()

  const currentLabel = SERVER_TABS.find((t) => t.key === tab)?.label ?? 'Settings'

  const tabContent = (
    <>
      {tab === 'overview' && <OverviewTab server={server} />}
      {tab === 'welcome' && <WelcomeTab server={server} />}
      {tab === 'afk' && <AfkTab server={server} />}
      {tab === 'roles' && <RolesTab server={server} />}
      {tab === 'members' && <MembersTab server={server} />}
      {tab === 'bans' && <BansTab server={server} />}
      {tab === 'webhooks' && <WebhooksTab server={server} />}
      {tab === 'emoji-stats' && <EmojiStatsTab server={server} />}
      {tab === 'automod' && <AutoModTab server={server} />}
      {tab === 'audit' && <AuditLogTab server={server} />}
      {tab === 'insights' && <InsightsTab server={server} />}
      {tab === 'onboarding' && <OnboardingTab server={server} />}
      {tab === 'danger' && <DangerTab server={server} onClose={onClose} />}
    </>
  )

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-surface" role="dialog" aria-modal="true" aria-label="Server Settings">
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close server settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ml-2 text-base font-semibold text-white">{currentLabel}</h1>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-white/10 scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5">
            {SERVER_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  tab === t.key ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <SimpleBar className="min-w-0 flex-1">
          <div className="px-4 py-4">{tabContent}</div>
        </SimpleBar>
      </div>
    )
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-[720px]" noPadding className="flex h-[80vh] overflow-hidden">
      <nav className="flex w-44 shrink-0 flex-col gap-0.5 bg-surface-darkest p-3">
        <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Server Settings</h2>
        {SERVER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-2 py-1.5 text-left text-sm transition ${
              tab === t.key ? 'bg-surface-selected text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h1 className="text-lg font-semibold text-white">{currentLabel}</h1>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 transition hover:text-white">
            <XIcon />
          </button>
        </div>

        <SimpleBar className="flex-1 p-6">{tabContent}</SimpleBar>
      </div>
    </ModalOverlay>
  )
}
