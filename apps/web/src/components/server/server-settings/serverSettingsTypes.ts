export type Tab = 'overview' | 'welcome' | 'afk' | 'roles' | 'members' | 'bans' | 'webhooks' | 'emoji-stats' | 'automod' | 'audit' | 'insights' | 'onboarding' | 'danger'

export const SERVER_TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'welcome', label: 'Welcome' },
  { key: 'afk', label: 'AFK Channel' },
  { key: 'roles', label: 'Roles' },
  { key: 'members', label: 'Members' },
  { key: 'bans', label: 'Bans' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'emoji-stats', label: 'Emojis' },
  { key: 'automod', label: 'Auto-Mod' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'insights', label: 'Insights' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'danger', label: 'Danger Zone' }
]

export type WebhookItem = {
  id: string
  channelId: string
  name: string
  token: string
  createdAt: string
}
