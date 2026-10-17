import '@testing-library/jest-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MessageActions } from './MessageActions'
import { useTranslationStore } from '@/stores/translation.store'
import { useServerStore } from '@/stores/server.store'
import { copyMessageContent } from '@/lib/messageClipboard'
import { makeMessage } from '@/test/factories'

jest.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ has: () => false }),
  Permission: { MANAGE_MESSAGES: 1 }
}))
jest.mock('@/lib/messageClipboard', () => ({
  copyMessageContent: jest.fn().mockResolvedValue(true),
  shareMessageLink: jest.fn()
}))
jest.mock('@/lib/api', () => ({ api: {} }))
jest.mock('@/lib/socket', () => ({ getSocket: () => null }))
jest.mock('@/i18n/config', () => ({ i18n: { language: 'en' } }))
const translate = jest.fn().mockResolvedValue(null)

beforeEach(() => {
  jest.clearAllMocks()
  useServerStore.setState({ currentServerId: 'server' })
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
