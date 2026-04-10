import { buildMessageJumpPath, buildForwardQuoteBlock, getMessageShareUrl } from './messageLink'
import type { Message } from '@chat/shared'

jest.mock('./electron', () => ({ isElectron: false }))

describe('messageLink', () => {
  it('buildMessageJumpPath for channel encodes message id', () => {
    expect(
      buildMessageJumpPath('channel', {
        serverId: 's1',
        channelId: 'c1',
        messageId: 'a b',
      })
    ).toBe('/channels/s1/c1?m=a%20b')
  })

  it('buildMessageJumpPath for dm', () => {
    expect(buildMessageJumpPath('dm', { conversationId: 'd1', messageId: 'm1' })).toBe(
      '/channels/@me/d1?m=m1'
    )
  })

  it('getMessageShareUrl uses origin in browser mode', () => {
    expect(getMessageShareUrl('/channels/s/c?m=x')).toBe(`${window.location.origin}/channels/s/c?m=x`)
  })

  it('buildForwardQuoteBlock includes author and link', () => {
    const msg = {
      id: 'm1',
      content: 'hello',
      author: { username: 'alice', displayName: null },
    } as unknown as Message
    const block = buildForwardQuoteBlock(msg, '#general', 'https://example.com/jump')
    expect(block).toContain('alice')
    expect(block).toContain('#general')
    expect(block).toContain('https://example.com/jump')
    expect(block).toContain('hello')
  })
})
