export type Tab = 'overview' | 'welcome' | 'afk' | 'roles' | 'members' | 'webhooks' | 'emoji-stats' | 'automod' | 'audit' | 'danger'

export const SERVER_TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'afk', label: 'AFK Channel' },
  { key: 'roles', label: 'Roles' },
  { key: 'members', label: 'Members' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'emoji-stats', label: 'Emojis' },
  { key: 'automod', label: 'Auto-Mod' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'danger', label: 'Danger Zone' }
]

export type WebhookItem = {
  id: string
  channelId: string
  name: string
  token: string
  createdAt: string
}
