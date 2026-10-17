import '@testing-library/jest-dom'
import type { Message } from '@chat/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MessageTranslationBlock } from './MessageTranslationBlock'
import { useTranslationStore } from '@/stores/translation.store'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import { api, type TranslationResult } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    getTranslationCapabilities: jest.fn(),
    getTranslationPreference: jest.fn(),
    setTranslationPreference: jest.fn(),
    translateMessage: jest.fn()
  }
}))
jest.mock('@/components/MarkdownContent', () => ({
  MarkdownContent: ({ content }: { content: string }) => <p>{content}</p>
}))
jest.mock('@/components/chat/TranslateModal', () => ({
  TranslateModal: (props: { messageId: string; sourceVersion?: string; initialTarget?: string }) => (
    <div role="dialog" data-message-id={props.messageId} data-source-version={props.sourceVersion}>
      {props.initialTarget}
    </div>
  )
}))

const message: Message = {
  id: 'm1',
  channelId: 'c1',
  directConversationId: null,
  authorId: 'u1',
  replyToId: null,
  threadParentId: null,
  webhookId: null,
  content: 'hello',
  pinned: false,
  createdAt: '2026-10-17T12:00:00Z',
  editedAt: null
}
const mockTranslate = api.translateMessage as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  useTranslationStore.setState({
    ...useTranslationStore.getInitialState(),
    capabilities: { enabled: true, languages: [{ code: 'cs', name: 'Czech', targets: ['en'] }] }
  })
  mockTranslate.mockResolvedValue({ content: 'translated text', targetLang: 'cs', detectedLang: 'en' })
})

async function translate(source = message) {
  await useTranslationStore.getState().translate(source.id, 'cs', messageTranslationVersion(source))
}

describe('MessageTranslationBlock', () => {
  it('renders nothing without a translation', () => {
    const { container } = render(<MessageTranslationBlock message={message} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the matching revision and supports hiding and showing its text', async () => {
    await translate()
    render(<MessageTranslationBlock message={message} />)
    expect(screen.getByText('translated text')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'translateHide' }))
    expect(screen.queryByText('translated text')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'translateShow' }))
    expect(screen.getByText('translated text')).toBeInTheDocument()
  })

  it('passes the current source revision when reopening the language picker', async () => {
    await translate()
    render(<MessageTranslationBlock message={message} />)
    fireEvent.click(screen.getByRole('button', { name: 'Czech' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-source-version', messageTranslationVersion(message))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-message-id', message.id)
  })

  it('never shows a cached translation when content changes before editedAt updates', async () => {
    await translate()
    const { rerender, container } = render(<MessageTranslationBlock message={message} />)
    rerender(<MessageTranslationBlock message={{ ...message, content: 'edited content' }} />)
    expect(container).toBeEmptyDOMElement()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('invalidates hidden translations when editedAt changes even with identical content', async () => {
    await translate()
    useTranslationStore.getState().toggleHidden(message.id)
    const { container } = render(<MessageTranslationBlock message={{ ...message, editedAt: '2026-10-17T13:00:00Z' }} />)
    expect(container).toBeEmptyDOMElement()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('invalidates old session cache after an edited message is reloaded from history', async () => {
    await translate()
    const original = render(<MessageTranslationBlock message={message} />)
    original.unmount()
    const { container } = render(<MessageTranslationBlock message={{ ...message, content: 'history edit' }} />)
    expect(container).toBeEmptyDOMElement()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('does not show legacy cache without a verifiable source revision', async () => {
    await useTranslationStore.getState().translate(message.id, 'cs')
    const { container } = render(<MessageTranslationBlock message={message} />)
    expect(container).toBeEmptyDOMElement()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('cancels an old pending revision and discards its eventual response on an edit', async () => {
    let resolve!: (value: TranslationResult) => void
    mockTranslate.mockReturnValueOnce(
      new Promise<TranslationResult>((res) => {
        resolve = res
      })
    )
    const pending = translate()
    const { rerender, container } = render(<MessageTranslationBlock message={message} />)
    expect(useTranslationStore.getState().pending[message.id]).toBe('cs')
    rerender(<MessageTranslationBlock message={{ ...message, content: 'edited while pending' }} />)
    expect(useTranslationStore.getState().pending[message.id]).toBeUndefined()
    await act(async () => {
      resolve({ content: 'stale translation', targetLang: 'cs', detectedLang: 'en' })
      await pending
    })
    expect(container).toBeEmptyDOMElement()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('cancels stale pending requests even when first mounted with reloaded history', async () => {
    let resolve!: (value: TranslationResult) => void
    mockTranslate.mockReturnValueOnce(
      new Promise<TranslationResult>((res) => {
        resolve = res
      })
    )
    const pending = translate()
    render(<MessageTranslationBlock message={{ ...message, content: 'history edit' }} />)
    expect(useTranslationStore.getState().pending).toEqual({})
    await act(async () => {
      resolve({ content: 'stale translation', targetLang: 'cs', detectedLang: 'en' })
      await pending
    })
    expect(screen.queryByText('stale translation')).not.toBeInTheDocument()
    expect(useTranslationStore.getState().translations[message.id]).toBeUndefined()
  })

  it('does not reopen an old picker when a different revision is translated', async () => {
    await translate()
    const { rerender } = render(<MessageTranslationBlock message={message} />)
    fireEvent.click(screen.getByRole('button', { name: 'Czech' }))
    const edited = { ...message, content: 'edited content' }
    rerender(<MessageTranslationBlock message={edited} />)
    await act(async () => {
      await translate(edited)
    })
    expect(screen.getByText('translated text')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
