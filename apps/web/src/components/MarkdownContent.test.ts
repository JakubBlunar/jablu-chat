import { escapeHtml, VIDEO_ALLOWED_ATTRS, AUDIO_ALLOWED_ATTRS } from '@/lib/markdownSecurity'
import { processMentions, type RoleMentionRef } from '@/lib/markdownMentions'
import type { Member } from '@/stores/member.store'

function member(
  id: string,
  username: string,
  displayName: string | null = null
): Member {
  return {
    userId: id,
    serverId: 's1',
    roleIds: [],
    joinedAt: '',
    user: { id, username, displayName, avatarUrl: null, bio: null }
  }
}

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s')
  })

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes greater-than', () => {
    expect(escapeHtml('1 > 0')).toBe('1 &gt; 0')
  })

  it('escapes all special chars in a combined string', () => {
    expect(escapeHtml('<img alt="x\'s & y\'s">')).toBe(
      '&lt;img alt=&quot;x&#39;s &amp; y&#39;s&quot;&gt;'
    )
  })

  it('returns original string when no special chars are present', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
  })

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })
})

describe('video sanitize attributes', () => {
  it('does not allow autoPlay', () => {
    expect([...VIDEO_ALLOWED_ATTRS]).not.toContain('autoPlay')
    expect([...VIDEO_ALLOWED_ATTRS]).not.toContain('autoplay')
  })

  it('still allows controls, muted, playsInline', () => {
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('controls')
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('muted')
    expect([...VIDEO_ALLOWED_ATTRS]).toContain('playsInline')
  })
})

describe('processMentions', () => {
  it('links @word to user when present in map', () => {
    const map = new Map<string, Member>([['alice', member('1', 'alice', null)]])
    expect(processMentions('hi @alice', map)).toContain('](mention:alice)')
  })

  it('links @word to role when no user match', () => {
    const byUser = new Map<string, Member>()
    const roles = new Map<string, RoleMentionRef>([
      ['mods', { id: 'r1', name: 'Mods', color: '#ff0000' }]
    ])
    expect(processMentions('hi @Mods', byUser, roles)).toBe('hi [@Mods](mention:role:r1)')
  })

  it('prefers quoted display name over role name', () => {
    const map = new Map<string, Member>([['alice', member('1', 'alice', 'Team')]])
    const roles = new Map<string, RoleMentionRef>([
      ['team', { id: 'r1', name: 'Team', color: null }]
    ])
    const out = processMentions('@"Team" meetup', map, roles)
    expect(out).toContain('](mention:alice)')
    expect(out).not.toContain('mention:role:')
  })
})

describe('audio sanitize attributes', () => {
  it('does not allow autoPlay', () => {
    expect([...AUDIO_ALLOWED_ATTRS]).not.toContain('autoPlay')
    expect([...AUDIO_ALLOWED_ATTRS]).not.toContain('autoplay')
  })

  it('still allows controls', () => {
    expect([...AUDIO_ALLOWED_ATTRS]).toContain('controls')
  })
})
