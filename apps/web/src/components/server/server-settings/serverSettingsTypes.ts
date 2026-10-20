export type Tab = 'overview' | 'welcome' | 'afk' | 'roles' | 'members' | 'bans' | 'webhooks' | 'bots' | 'emoji-stats' | 'automod' | 'audit' | 'insights' | 'onboarding' | 'leveling' | 'danger'

export const SERVER_TABS: Tab[] = [
  'overview',
  'welcome',
  'afk',
  'roles',
  'members',
  'bans',
  'webhooks',
  'bots',
  'emoji-stats',
  'automod',
  'audit',
  'insights',
  'onboarding',
  'leveling',
  'danger'
]

export type WebhookItem = {
  id: string
  channelId: string
  name: string
  token: string
  createdAt: string
}
