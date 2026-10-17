import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GroupConversationDetails } from './GroupConversationDetails'
import type { DmConversation } from '@/lib/api'

jest.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => ({ goToFriends: jest.fn() }) }))
jest.mock('@/components/UserAvatar', () => ({ UserAvatar: () => null }))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('simplebar-react', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

const conversation: DmConversation = {
  id: 'conv',
  isGroup: true,
  groupName: 'Original',
  createdAt: '',
  members: []
}

it('refreshes the group name from another device without overwriting a local draft', () => {
  const props = { conversation, onClose: jest.fn() }
  const { rerender } = render(<GroupConversationDetails {...props} />)
  rerender(<GroupConversationDetails {...props} conversation={{ ...conversation, groupName: 'Remote edit' }} />)
  expect(screen.getByLabelText('conversationGroupName')).toHaveValue('Remote edit')
  fireEvent.change(screen.getByLabelText('conversationGroupName'), { target: { value: 'Local draft' } })
  rerender(<GroupConversationDetails {...props} conversation={{ ...conversation, groupName: 'Another remote edit' }} />)
  expect(screen.getByLabelText('conversationGroupName')).toHaveValue('Local draft')
})

it('reports nested dialogs so Escape does not dismiss the parent panel', () => {
  const onDialogOpenChange = jest.fn()
  render(
    <GroupConversationDetails conversation={conversation} onClose={jest.fn()} onDialogOpenChange={onDialogOpenChange} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'conversationAddMembers' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(onDialogOpenChange).toHaveBeenLastCalledWith(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(onDialogOpenChange).toHaveBeenLastCalledWith(false)
})
