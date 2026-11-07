import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ChatInputBar } from './ChatInputBar'
import type { MentionMember } from './composerTypes'
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: jest.fn(), configurable: true })
)
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

const member = { userId: 'reno-id', username: 'jt', displayName: 'Reno', avatarUrl: null }
function Composer({ members = [member] }: { members?: MentionMember[] }) {
  const [value, setValue] = useState('')
  return <ChatInputBar value={value} onChange={setValue} onSend={jest.fn()} placeholder="Message" members={members} />
}
it('shows the server nickname first, keeps the account handle visible and completes @reno', async () => {
  const user = userEvent.setup()
  render(<Composer />)
  await user.type(screen.getByRole('textbox'), '@re')
  const suggestion = screen.getByRole('option', { name: /@Reno.*@jt/ })
  await user.click(suggestion)
  expect(screen.getByRole('textbox')).toHaveValue('@Reno ')
  await user.type(screen.getByRole('textbox'), 'hello immediately')
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  expect(screen.getByRole('textbox')).toHaveValue('@Reno hello immediately')
})
it('falls back to the account handle when server nicknames collide', async () => {
  const user = userEvent.setup()
  render(<Composer members={[member, { ...member, userId: 'other-id', username: 'other' }]} />)
  await user.type(screen.getByRole('textbox'), '@re')
  await user.click(screen.getByRole('option', { name: /@Reno.*@jt/ }))
  expect(screen.getByRole('textbox')).toHaveValue('@jt ')
})
