import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useIsMobile } from '@/hooks/useMobile'
import SimpleBar from 'simplebar-react'
import { VoiceSettings } from '@/components/voice/VoiceSettings'
import { DownloadAppSection } from '@/components/settings/DownloadApp'
import { PwaInstallGuide } from '@/components/PwaInstallGuide'
import { electronAPI, isElectron } from '@/lib/electron'
import { getIsStandalone } from '@/hooks/usePwaInstall'
import { KeyboardShortcutsSection } from '@/components/settings/KeyboardShortcuts'
import { useAuthStore } from '@/stores/auth.store'
import type { Tab } from '@/components/settings/settingsTypes'
import { AccountSection } from '@/components/settings/sections/AccountSection'
import { ActiveSessionsSection } from '@/components/settings/sections/ActiveSessionsSection'
import { AppVersionInfo } from '@/components/settings/sections/AppVersionInfo'
import { DesktopAppSection } from '@/components/settings/sections/DesktopAppSection'
import { NotificationsSection } from '@/components/settings/sections/NotificationsSection'
import { PrivacySection } from '@/components/settings/sections/PrivacySection'
import { ProfileSection } from '@/components/settings/sections/ProfileSection'
import { ServerConnectionSection } from '@/components/settings/sections/ServerConnectionSection'
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection'
import { StatusSection } from '@/components/settings/sections/StatusSection'
import { MyBotsSection } from '@/components/settings/sections/MyBotsSection'

export function CameraIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z" />
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
    </svg>
  )
}

export function SettingsModal({ open, onClose, initialTab }: { open: boolean; onClose: () => void; initialTab?: string }) {
  const { t } = useTranslation('settings')
  const [tab, setTab] = useState<Tab>((initialTab as Tab) || 'account')
  const modalRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  useFocusTrap(modalRef, open)

  useEffect(() => {
    if (initialTab) setTab(initialTab as Tab)
  }, [initialTab])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const tabEntries: { key: Tab; label: string; show?: boolean }[] = useMemo(
    () => [
      { key: 'account', label: t('tabs.account') },
      { key: 'profile', label: t('tabs.profile') },
      { key: 'status', label: t('tabs.status') },
      { key: 'appearance', label: t('tabs.appearance') },
      { key: 'privacy', label: t('tabs.privacy') },
      { key: 'voice', label: t('tabs.voice') },
      { key: 'notifications', label: t('tabs.notifications') },
      { key: 'my-bots', label: t('tabs.myBots') },
      { key: 'sessions', label: t('tabs.sessions') },
      { key: 'shortcuts', label: t('tabs.shortcuts'), show: !isMobile },
      { key: 'server', label: t('tabs.server'), show: isElectron },
      { key: 'desktop', label: t('tabs.desktop'), show: isElectron },
      { key: 'downloads', label: t('tabs.downloads'), show: !isElectron && !isMobile },
      { key: 'install', label: t('tabs.install'), show: !isElectron && !getIsStandalone() }
    ],
    [t, isMobile]
  )

  const visibleTabs = tabEntries.filter((t) => t.show !== false)
  const currentLabel = visibleTabs.find((t) => t.key === tab)?.label ?? 'Settings'

  const settingsContent = (
    <>
      {tab === 'account' && <AccountSection />}
      {tab === 'profile' && <ProfileSection />}
      {tab === 'status' && <StatusSection />}
      {tab === 'appearance' && <AppearanceSection />}
      {tab === 'privacy' && <PrivacySection />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'notifications' && <NotificationsSection />}
      {tab === 'my-bots' && <MyBotsSection />}
      {tab === 'sessions' && <ActiveSessionsSection />}
      {tab === 'shortcuts' && <KeyboardShortcutsSection />}
      {tab === 'server' && <ServerConnectionSection />}
      {tab === 'desktop' && <DesktopAppSection />}
      {tab === 'downloads' && <DownloadAppSection />}
      {tab === 'install' && <PwaInstallGuide />}
    </>
  )

  if (isMobile) {
    return (
      <div
        ref={modalRef}
        className="fixed inset-0 z-[100] flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
      >
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label={t('closeSettings')}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ml-2 text-base font-semibold text-white">{currentLabel}</h1>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-white/10 scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5" role="tablist" aria-label={t('title')}>
            {visibleTabs.map((te) => (
              <button
                key={te.key}
                type="button"
                role="tab"
                aria-selected={tab === te.key}
                id={`settings-tab-${te.key}`}
                onClick={() => setTab(te.key)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                  tab === te.key ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {te.label}
              </button>
            ))}
            <LogOutButton onClose={onClose} mobile />
          </div>
        </div>
        <SimpleBar className="min-h-0 flex-1">
          <div className="px-4 py-6">{settingsContent}</div>
        </SimpleBar>
      </div>
    )
  }

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[100] flex bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
    >
      {/* Left sidebar */}
      <div className="flex w-56 shrink-0 flex-col items-end bg-surface-dark">
        <nav className="w-44 space-y-0.5 px-2 py-16" aria-label={t('userSettings')}>
          <SectionHeading className="mb-1 px-2">{t('userSettings')}</SectionHeading>
          {visibleTabs.map((te) => (
            <SidebarButton key={te.key} active={tab === te.key} onClick={() => setTab(te.key)}>
              {te.label}
            </SidebarButton>
          ))}
          <div className="my-2 border-t border-white/10" />
          <LogOutButton onClose={onClose} />
          {isElectron && electronAPI && (
            <div className="mt-4 border-t border-white/10 pt-4 px-2">
              <AppVersionInfo />
            </div>
          )}
        </nav>
      </div>

      {/* Main content */}
      <SimpleBar className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[660px] px-10 py-16">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">{currentLabel}</h1>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
              aria-label={t('closeSettings')}
            >
              <CloseIcon />
            </button>
          </div>

          <div className="mt-6">{settingsContent}</div>
        </div>
      </SimpleBar>
    </div>
  )
}

function SidebarButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
        active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function LogOutButton({ onClose, mobile }: { onClose: () => void; mobile?: boolean }) {
  const { t } = useTranslation('settings')
  const logout = useAuthStore((s) => s.logout)
  return (
    <button
      type="button"
      onClick={() => {
        onClose()
        void logout()
      }}
      className={
        mobile
          ? 'shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300'
          : 'block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium text-red-400 transition hover:bg-red-500/10 hover:text-red-300'
      }
    >
      {t('logOut')}
    </button>
  )
}
