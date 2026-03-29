import { useCallback, useEffect, useState } from 'react'
import type { AdminServer, AdminUser, AdminInvite, Tab } from './adminTypes'
import { adminFetch, clearStoredToken, getStoredToken } from './adminApi'
import { ServersTab } from './tabs/ServersTab'
import { UsersTab } from './tabs/UsersTab'
import { StatsTab } from './tabs/StatsTab'
import { ModerationTab } from './tabs/ModerationTab'
import { WebhooksTab } from './tabs/WebhooksTab'
import { AuditLogTab } from './tabs/AuditLogTab'
import { InvitesTab } from './tabs/InvitesTab'
import { StorageTab } from './tabs/StorageTab'
import { PushTab } from './tabs/PushTab'
import { DeletedMessagesTab } from './tabs/DeletedMessagesTab'

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('servers')
  const [servers, setServers] = useState<AdminServer[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invites, setInvites] = useState<AdminInvite[]>([])
  const [regMode, setRegMode] = useState('open')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAll = useCallback(async () => {
    setError('')
    try {
      const [s, u, inv, settings] = await Promise.all([
        adminFetch<AdminServer[]>('/api/admin/servers'),
        adminFetch<AdminUser[]>('/api/admin/users'),
        adminFetch<AdminInvite[]>('/api/admin/invites'),
        adminFetch<{ mode: string }>('/api/admin/settings/registration')
      ])
      setServers(s)
      setUsers(u)
      setInvites(inv)
      setRegMode(settings.mode)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      if (msg.includes('Unauthorized') || msg.includes('admin token') || msg.includes('expired')) {
        clearStoredToken()
        window.location.reload()
        return
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  const NAV_ITEMS: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { key: 'servers', label: 'Servers', badge: servers.length, icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="6" cy="18" r="1" fill="currentColor"/></svg> },
    { key: 'users', label: 'Users', badge: users.length, icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { key: 'invites', label: 'Invites', badge: invites.length, icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg> },
    { key: 'audit', label: 'Audit Log', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6"/><path d="M9 16h6"/></svg> },
    { key: 'stats', label: 'Stats', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg> },
    { key: 'moderation', label: 'Moderation', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
    { key: 'webhooks', label: 'Webhooks', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
    { key: 'storage', label: 'Storage', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> },
    { key: 'push', label: 'Push', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    { key: 'deleted', label: 'Deleted Messages', icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> }
  ]

  return (
    <div className="flex h-screen flex-col bg-surface-darkest text-white">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-3">
        <h1 className="text-lg font-bold">Admin Panel</h1>
        <button
          type="button"
          onClick={() => {
            const token = getStoredToken()
            if (token) {
              void fetch('/api/admin/logout', {
                method: 'POST',
                headers: { 'x-admin-token': token }
              })
            }
            clearStoredToken()
            window.location.reload()
          }}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 transition hover:bg-white/5 hover:text-white"
        >
          Logout
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <nav className="w-52 shrink-0 overflow-y-auto border-r border-white/10 py-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`mx-2 mb-0.5 flex w-[calc(100%-16px)] items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                tab === item.key
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
              {item.badge != null && (
                <span className="ml-auto text-[11px] tabular-nums text-gray-500">{item.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-gray-400">Loading…</div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl">
              {error && (
                <div className="mb-4 rounded-md bg-red-900/30 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/30">
                  {error}
                  <button type="button" onClick={() => void fetchAll()} className="ml-2 underline hover:text-white">
                    Retry
                  </button>
                </div>
              )}
              {tab === 'servers' && <ServersTab servers={servers} setServers={setServers} users={users} />}
              {tab === 'users' && <UsersTab users={users} setUsers={setUsers} />}
              {tab === 'invites' && (
                <InvitesTab invites={invites} setInvites={setInvites} servers={servers} regMode={regMode} />
              )}
              {tab === 'audit' && <AuditLogTab servers={servers} />}
              {tab === 'stats' && <StatsTab />}
              {tab === 'moderation' && <ModerationTab />}
              {tab === 'webhooks' && <WebhooksTab />}
              {tab === 'storage' && <StorageTab />}
              {tab === 'push' && <PushTab users={users} />}
              {tab === 'deleted' && <DeletedMessagesTab />}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
