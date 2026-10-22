import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { InsightsTab } from './InsightsTab'
import { api, type ServerInsights } from '@/lib/api'
import type { Server } from '@/stores/server.store'

jest.mock('@/lib/serverUrl', () => ({ getServerBaseUrl: () => '' }))

const server: Server = {
  id: 'server',
  name: 'Test server',
  iconUrl: null,
  ownerId: 'alice',
  createdAt: '',
  memberCount: 1
}

const insights: ServerInsights = {
  overview: { totalMembers: 1, totalChannels: 1, totalMessages: 10, textChannels: 1, voiceChannels: 0 },
  messagesByDay: [],
  topChannels: [],
  topContributors: [{ userId: 'alice', username: 'alice', displayName: 'Alice', avatarUrl: '/uploads/alice.png', count: 10 }],
  membersByWeek: []
}

const originalBaseUrl = api.baseUrl

afterEach(() => {
  api.baseUrl = originalBaseUrl
  jest.restoreAllMocks()
})

it.each([
  ['desktop', 'https://chat.example.com', '/uploads/alice.png', 'https://chat.example.com/uploads/alice.png'],
  ['web', '', '/uploads/alice.png', '/uploads/alice.png'],
  ['desktop with an absolute avatar URL', 'https://chat.example.com', 'https://cdn.example.com/alice.png', 'https://cdn.example.com/alice.png']
])('loads contributor photos on %s', async (_environment, baseUrl, avatarUrl, expectedSrc) => {
  api.baseUrl = baseUrl
  jest.spyOn(api, 'getServerInsights').mockResolvedValue({
    ...insights,
    topContributors: [{ ...insights.topContributors[0], avatarUrl }]
  })

  render(<InsightsTab server={server} />)

  const name = await screen.findByText('Alice')
  const row = name.parentElement!
  expect(within(row).getByRole('presentation')).toHaveAttribute('src', expectedSrc)
  expect(api.getServerInsights).toHaveBeenCalledWith('server')
})
