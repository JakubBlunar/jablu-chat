import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { ConversationInfoPanel } from './ConversationInfoPanel'

let mobile = false
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => mobile }))
jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ goToFriends: jest.fn() }) }))
jest.mock('@/components/ui/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>
}))
jest.mock('./DmProfilePanel', () => ({ DmProfilePanel: () => <div>Profile content</div> }))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('@/components/chat/PinnedMessagesList', () => ({ PinnedMessagesList: () => <div>Pinned content</div> }))
jest.mock('@/components/media/AttachmentBrowser', () => ({
  AttachmentBrowser: ({ onJump }: { onJump: (id: string) => void }) => (
    <button onClick={() => onJump('old-message')}>Open original</button>
  )
}))
jest.mock('@/lib/api', () => ({ api: { getDmAttachments: jest.fn() } }))

function props(): ComponentProps<typeof ConversationInfoPanel> {
  return {
    conversation: {
      id: 'conv',
      isGroup: true,
      groupName: 'Friends',
      createdAt: '',
      members: [
        {
          userId: 'alice',
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          bio: null,
          status: 'online',
          createdAt: ''
        }
      ]
    },
    currentUserId: 'alice',
    otherMember: null,
    mutualServers: [],
    tab: 'details',
    onTabChange: jest.fn(),
    onClose: jest.fn(),
    onSearch: jest.fn(),
    onJump: jest.fn(),
    pinned: {
      pinnedOpen: false,
      pinnedMessages: [],
      pinnedLoading: false,
      pinnedError: false,
      isDm: true,
      loadPinned: jest.fn().mockResolvedValue(undefined),
      setPinnedOpen: jest.fn(),
      handleOpenPinned: jest.fn()
    }
  }
}

beforeEach(() => {
  mobile = false
})

it('shows group members and makes shared media available for groups', () => {
  const p = props()
  const { rerender } = render(<ConversationInfoPanel {...p} />)
  expect(screen.getByText(/Alice/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'conversationMedia' }))
  expect(p.onTabChange).toHaveBeenCalledWith('media')
  rerender(<ConversationInfoPanel {...p} tab="media" />)
  fireEvent.click(screen.getByText('Open original'))
  expect(p.onClose).toHaveBeenCalled()
  expect(p.onJump).toHaveBeenCalledWith('old-message')
})

it('renders as a mobile sheet with the same tabs and loads pins', () => {
  mobile = true
  const p = props()
  render(<ConversationInfoPanel {...p} tab="pins" />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(5)
  expect(p.pinned.loadPinned).toHaveBeenCalled()
  expect(screen.getByText('Pinned content')).toBeInTheDocument()
})

it('keeps tab focus and selection in sync for keyboard navigation', () => {
  const p = props()
  render(<ConversationInfoPanel {...p} />)
  fireEvent.keyDown(screen.getByRole('tab', { name: 'channelInfoTabMembers' }), { key: 'End' })
  expect(p.onTabChange).toHaveBeenCalledWith('pins')
  expect(screen.getByRole('tab', { name: 'channelInfoTabPins' })).toHaveFocus()
})
