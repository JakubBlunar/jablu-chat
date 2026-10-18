import { BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { groupKey, isoDate, object, storedSession, target } from './inbox.validation'
import type { InboxSession, InboxTarget } from '@chat/shared'

const channel: InboxTarget = {
  mode: 'channel', contextId: randomUUID(), serverId: randomUUID(), threadParentId: null, messageId: null
}

describe('Inbox runtime validation', () => {
  it('validates exact channel and DM target shapes', () => {
    expect(target(channel)).toEqual(channel)
    expect(target({ ...channel, mode: 'dm', serverId: null })).toMatchObject({ mode: 'dm' })
  })

  it.each([
    null, [], {}, { ...channel, userId: randomUUID() }, { ...channel, contextId: 'not-an-id' },
    { ...channel, serverId: null }, { ...channel, threadParentId: undefined },
    { ...channel, mode: 'dm' }, { ...channel, mode: 'dm', serverId: null, threadParentId: randomUUID() },
    { ...channel, messageId: 42 }
  ])('rejects invalid targets: %j', (value) => {
    expect(() => target(value)).toThrow(BadRequestException)
  })

  it('requires explicit ISO timestamps and rejects extra DTO fields', () => {
    expect(isoDate('2026-10-18T10:00:00+02:00')).toBe('2026-10-18T08:00:00.000Z')
    expect(() => isoDate('2026-10-18')).toThrow(BadRequestException)
    expect(() => isoDate('nope')).toThrow(BadRequestException)
    expect(() => isoDate('2026-02-30T00:00:00Z')).toThrow(BadRequestException)
    expect(() => isoDate('2026-10-18T24:00:00Z')).toThrow(BadRequestException)
    expect(() => object({ revision: 0, userId: 'other' }, ['revision'])).toThrow(BadRequestException)
  })

  it('rejects invalid persisted session state and foreign anchors', () => {
    const session: InboxSession = {
      id: randomUUID(), revision: 0, view: 'unread', snapshotAt: new Date().toISOString(),
      groups: [{
        key: groupKey(channel), target: channel, name: 'general', serverName: 'Server',
        unreadCount: 1, mentionCount: 0, replyCount: 0, latestAt: new Date().toISOString(),
        highlights: [], savedAt: null
      }],
      index: 0, completed: 0, deferred: 0, anchor: null
    }
    expect(storedSession(session)).toEqual(session)
    expect(storedSession({ ...session, groups: [{ ...session.groups[0], unavailable: true }] })
      .groups[0]).toMatchObject({ unavailable: true })
    for (const invalid of [
      { ...session, index: 2 }, { ...session, revision: -1 },
      { ...session, completed: 1 }, { ...session, groups: [...session.groups, ...session.groups] },
      { ...session, anchor: { ...channel, contextId: randomUUID() } },
      { ...session, anchor: channel },
      { ...session, groups: [{ ...session.groups[0], key: 'forged' }] },
      { ...session, groups: [{ ...session.groups[0], unavailable: 'true' }] }
    ]) expect(() => storedSession(invalid)).toThrow(BadRequestException)
  })
})
