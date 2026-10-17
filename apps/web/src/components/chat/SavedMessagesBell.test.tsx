import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { SavedMessagesBell } from './SavedMessagesBell'
import type { SavedMessageLocation } from './SavedMessagesList'

const mockNavigate = jest.fn()
let mockLocation: SavedMessageLocation
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ navigate: mockNavigate }) }))
jest.mock('@/hooks/useFocusTrap', () => ({ useFocusTrap: jest.fn() }))
jest.mock('@/hooks/useBackGestureClose', () => ({ useBackGestureClose: jest.fn() }))
jest.mock('./SavedMessagesList', () => ({
  SavedMessagesList: ({ onJump }: { onJump: (id: string, location: SavedMessageLocation) => void }) => (
    <button type="button" onClick={() => onJump('target', mockLocation)}>
      Jump
    </button>
  )
}))

it.each<[SavedMessageLocation, string]>([
  [{ conversationId: 'conversation' }, '/channels/@me/conversation?m=target'],
  [{ serverId: 'server', channelId: 'channel' }, '/channels/server/channel?m=target'],
  [
    { serverId: 'server', channelId: 'channel', threadParentId: 'parent' },
    '/channels/server/channel?m=target&thread=parent'
  ]
])('routes a saved message to its real URL and preserves thread context', (location, expected) => {
  mockNavigate.mockClear()
  mockLocation = location
  render(<SavedMessagesBell />)
  fireEvent.click(screen.getByRole('button'))
  fireEvent.click(screen.getByRole('button', { name: 'Jump' }))
  expect(mockNavigate).toHaveBeenCalledWith(expected)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
