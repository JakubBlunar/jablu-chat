import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
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
import { StatusSection } from '@/components/settings/sections/StatusSection'

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

  const tabEntries: { key: Tab; label: string; show?: boolean }[] = [
    { key: 'account', label: 'My Account' },
    { key: 'profile', label: 'Profile' },
    { key: 'status', label: 'Status' },
    { key: 'privacy', label: 'Privacy' },
    { key: 'voice', label: 'Voice & Video' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'shortcuts', label: 'Keyboard Shortcuts', show: !isMobile },
    { key: 'server', label: 'Server Connection', show: isElectron },
    { key: 'desktop', label: 'Desktop App', show: isElectron },
    { key: 'downloads', label: 'Desktop App', show: !isElectron && !isMobile },
    { key: 'install', label: 'Install App', show: !isElectron && !getIsStandalone() }
  ]

  const visibleTabs = tabEntries.filter((t) => t.show !== false)
  const currentLabel = visibleTabs.find((t) => t.key === tab)?.label ?? 'Settings'

  const settingsContent = (
    <>
      {tab === 'account' && <AccountSection />}
      {tab === 'profile' && <ProfileSection />}
      {tab === 'status' && <StatusSection />}
      {tab === 'privacy' && <PrivacySection />}
      {tab === 'voice' && <VoiceSettings />}
      {tab === 'notifications' && <NotificationsSection />}
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
      <div ref={modalRef} className="fixed inset-0 z-[100] flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-2 text-gray-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close settings"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="ml-2 text-base font-semibold text-white">{currentLabel}</h1>
        </div>
        <div className="shrink-0 overflow-x-auto border-b border-white/10 scrollbar-none">
          <div className="flex gap-1 px-2 py-1.5">
            {visibleTabs.map((t) => (
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
    <div ref={modalRef} className="fixed inset-0 z-[100] flex bg-surface" role="dialog" aria-modal="true" aria-label="Settings">
      {/* Left sidebar */}
      <div className="flex w-56 shrink-0 flex-col items-end bg-surface-dark">
        <nav className="w-44 space-y-0.5 px-2 py-16">
          <p className="mb-1 px-2 text-[11px] font-semibold tracking-wide text-gray-400">USER SETTINGS</p>
          {visibleTabs.map((t) => (
            <SidebarButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
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
              title="Close"
              aria-label="Close settings"
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
      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition ${
        active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

function LogOutButton({ onClose, mobile }: { onClose: () => void; mobile?: boolean }) {
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
      Log Out
    </button>
  )
}
