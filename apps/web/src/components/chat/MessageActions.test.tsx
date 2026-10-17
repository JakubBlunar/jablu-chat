import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Profiler } from 'react'
import { MessageActions } from './MessageActions'
import { useTranslationStore } from '@/stores/translation.store'
import { useServerStore } from '@/stores/server.store'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { copyMessageContent } from '@/lib/messageClipboard'
import { makeMessage } from '@/test/factories'

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => false }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
jest.mock('@/hooks/useMobile', () => ({ useIsMobile: () => false }))
jest.mock('@/lib/messageClipboard', () => ({
  copyMessageContent: jest.fn().mockResolvedValue(true),
  shareMessageLink: jest.fn()
}))
jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))
jest.mock('@/stores/auth.store', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand')
  return { useAuthStore: create(() => ({ user: { id: 'user-1' } })) }
})
const translate = jest.fn().mockResolvedValue(null)

beforeEach(() => {
  jest.clearAllMocks()
  useServerStore.setState({ currentServerId: 'server' })
  useBookmarkStore.setState({ bookmarkedIds: new Set() })
  useTranslationStore.setState(
    {
      ...useTranslationStore.getInitialState(),
      fetchCapabilities: jest.fn().mockResolvedValue(undefined),
      loadPreference: jest.fn().mockResolvedValue(undefined),
      translate
    },
    true
  )
})

it('does no action setup or translation/bookmark renders for ten closed toolbars', () => {
  const committed = jest.fn()
  const messages = Array.from({ length: 10 }, () => makeMessage())
  render(
    <Profiler id="actions" onRender={committed}>
      {messages.map((message) => (
        <MessageActions key={message.id} message={message} mode="channel" contextId="channel" />
      ))}
    </Profiler>
  )
  const before = committed.mock.calls.length
  expect(useTranslationStore.getState().fetchCapabilities).not.toHaveBeenCalled()
  expect(useTranslationStore.getState().loadPreference).not.toHaveBeenCalled()
  act(() => {
    useTranslationStore.setState({ capabilitiesLoaded: true, capabilities: { enabled: true, languages: [] } })
    useBookmarkStore.setState({ bookmarkedIds: new Set([messages[0].id]) })
  })
  expect(committed).toHaveBeenCalledTimes(before)
  fireEvent.click(screen.getAllByRole('button', { name: 'actionMore' })[0])
  expect(useTranslationStore.getState().fetchCapabilities).toHaveBeenCalledTimes(1)
  expect(useTranslationStore.getState().loadPreference).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('menuitem', { name: 'actionRemoveBookmark' })).toBeInTheDocument()
})

it('keeps the delete dialog mounted when the action menu closes', () => {
  render(<MessageActions message={makeMessage()} mode="dm" contextId="dm" />)
  fireEvent.click(screen.getByRole('button', { name: 'actionMore' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionDelete' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(screen.getByText('deleteMessageWarning')).toBeInTheDocument()
})

it('keeps the language picker mounted when translating without a preferred language', () => {
  useTranslationStore.setState({
    capabilitiesLoaded: true,
    capabilities: { enabled: true, languages: [{ code: 'cs', name: 'Czech', targets: ['en'] }] }
  })
  render(<MessageActions message={makeMessage()} mode="channel" contextId="channel" />)
  fireEvent.click(screen.getByRole('button', { name: 'actionMore' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionTranslate' }))
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(screen.getByRole('radiogroup', { name: 'translateTitle' })).toBeInTheDocument()
})

it('adds Translate after capabilities arrive and uses a newly changed default target', async () => {
  render(<MessageActions message={makeMessage()} mode="channel" contextId="channel" />)
  fireEvent.click(screen.getByRole('button', { name: 'actionMore' }))
  expect(screen.queryByRole('menuitem', { name: 'actionTranslate' })).not.toBeInTheDocument()
  act(() =>
    useTranslationStore.setState({
      capabilitiesLoaded: true,
      capabilities: { enabled: true, languages: [] },
      targetLang: 'cs'
    })
  )
  await screen.findByRole('menuitem', { name: 'actionTranslate' })
  act(() => useTranslationStore.setState({ targetLang: 'sk' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionTranslate' }))
  expect(translate).toHaveBeenCalledWith(expect.any(String), 'sk', expect.any(String))
})

it('includes thread metadata in copied message links', () => {
  render(
    <MessageActions
      message={makeMessage({ id: 'reply', threadParentId: 'parent' })}
      mode="channel"
      contextId="channel"
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'actionMore' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'actionCopyMessageLink' }))
  expect(copyMessageContent).toHaveBeenCalledWith(expect.stringContaining('?m=reply&thread=parent'), true)
})
