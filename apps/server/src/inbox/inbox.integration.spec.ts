import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { DEFAULT_EVERYONE_PERMISSIONS, Permission } from '@chat/shared'
import type { InboxTarget } from '@chat/shared'
import { EventBusService } from '../events/event-bus.service'
import { PrismaService } from '../prisma/prisma.service'
import { RolesService } from '../roles/roles.service'
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service'
import { ReadStateService } from '../read-state/read-state.service'
import { InboxService } from './inbox.service'

const databaseUrl = process.env.INBOX_TEST_DATABASE_URL
const databaseDescribe = databaseUrl ? describe : describe.skip

databaseDescribe('Inbox catch-up (PostgreSQL)', () => {
  let prisma: PrismaService
  let inbox: InboxService
  let inApp: InAppNotificationsService
  let readState: ReadStateService
  let events: EventBusService
  const userId = randomUUID()
  const other = randomUUID()
  const outsider = randomUUID()
  const serverId = randomUUID()
  const secondServer = randomUUID()
  const channelId = randomUUID()
  const secondChannel = randomUUID()
  const dmId = randomUUID()
  const joined = new Date('2026-10-01T00:00:00Z')
  const oldAt = new Date('2026-10-17T10:00:00Z')
  const snapshot = new Date('2026-10-17T11:00:00Z')
  const newAt = new Date('2026-10-17T12:00:00Z')
  const channelTarget = (messageId: string | null = null, threadParentId: string | null = null): InboxTarget => ({
    mode: 'channel', contextId: channelId, serverId, threadParentId, messageId
  })
  const dmTarget = (messageId: string | null = null): InboxTarget => ({
    mode: 'dm', contextId: dmId, serverId: null, threadParentId: null, messageId
  })
  const message = (extra: Record<string, unknown> = {}) => prisma.message.create({
    data: { id: randomUUID(), channelId, authorId: other, content: 'Hello', createdAt: oldAt, ...extra }
  })
  async function notification(kind: 'mention' | 'reply' | 'thread_reply', id: string, extra = {}) {
    return prisma.inAppNotification.create({
      data: {
        userId, kind, payload: { channelId, serverId, messageId: id, ...extra },
        createdAt: oldAt, updatedAt: oldAt
      }
    })
  }
  async function frozenSession(selected: 'unread' | 'mentions' | 'replies' | 'later' = 'unread') {
    const { session } = await inbox.startSession(userId, { view: selected })
    // Establish a deterministic earlier cutoff to exercise coalesced incoming activity.
    session.snapshotAt = snapshot.toISOString()
    await prisma.inboxSession.update({ where: { userId }, data: { payload: JSON.parse(JSON.stringify(session)) } })
    return session
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }))
    await prisma.onModuleInit()
    events = new EventBusService()
    const roles = new RolesService(prisma, events)
    inApp = new InAppNotificationsService(prisma, events)
    readState = new ReadStateService(prisma, roles, inApp)
    inbox = new InboxService(prisma, roles, events)
    await prisma.user.createMany({ data: [userId, other, outsider].map((id) => ({
      id, username: `inbox-${id}`, email: `${id}@example.invalid`, passwordHash: 'test-only'
    })) })
    await prisma.server.createMany({ data: [
      { id: serverId, ownerId: other, name: 'First server' },
      { id: secondServer, ownerId: other, name: 'Second server' }
    ] })
    await prisma.role.createMany({ data: [serverId, secondServer].map((id) => ({
      serverId: id, name: '@everyone', isDefault: true, permissions: DEFAULT_EVERYONE_PERMISSIONS
    })) })
    await prisma.serverMember.createMany({ data: [serverId, secondServer].flatMap((id) =>
      [userId, other].map((member) => ({ serverId: id, userId: member, joinedAt: joined }))) })
    await prisma.channel.createMany({ data: [
      { id: channelId, serverId, name: 'general' },
      { id: secondChannel, serverId: secondServer, name: 'elsewhere' }
    ] })
    await prisma.directConversation.create({ data: { id: dmId } })
    await prisma.directConversationMember.createMany({
      data: [userId, other].map((id) => ({ conversationId: dmId, userId: id, joinedAt: joined }))
    })
  })

  beforeEach(async () => {
    await prisma.inboxSession.deleteMany({ where: { userId } })
    await prisma.inboxLater.deleteMany({ where: { userId } })
    await prisma.inboxThreadReadState.deleteMany({ where: { userId } })
    await prisma.inAppNotification.deleteMany({ where: { userId } })
    await prisma.message.deleteMany({ where: { OR: [
      { channelId: { in: [channelId, secondChannel] } }, { directConversationId: dmId }
    ] } })
    await prisma.channelReadState.deleteMany({ where: { userId } })
    await prisma.dmReadState.deleteMany({ where: { userId } })
    await prisma.channelNotifPref.deleteMany({ where: { userId } })
    await prisma.channelPermissionOverride.deleteMany({ where: { channelId: { in: [channelId, secondChannel] } } })
    await prisma.serverMember.updateMany({ where: { userId }, data: { notifLevel: null } })
    await prisma.directConversationMember.updateMany({
      where: { userId }, data: { muted: false, markedUnread: false }
    })
    events.removeAllListeners()
  })

  afterAll(async () => {
    if (!prisma) return
    try {
      await prisma.server.deleteMany({ where: { id: { in: [serverId, secondServer] } } })
      await prisma.directConversation.deleteMany({ where: { id: dmId } })
      await prisma.user.deleteMany({ where: { id: { in: [userId, other, outsider] } } })
    } finally {
      await prisma.onModuleDestroy()
    }
  })

  it('gets true unread independently of notifications, excludes own messages, caps at 100 and groups before paging', async () => {
    await prisma.message.createMany({ data: Array.from({ length: 125 }, (_, index) => ({
      channelId, authorId: other, content: `Unread ${index}`, createdAt: oldAt
    })) })
    await message({ authorId: userId })
    await message({ channelId: secondChannel })
    const page = await inbox.page(userId, { view: 'unread', limit: '1' })
    expect(page.counts.unread).toBe(2)
    expect(page.groups).toHaveLength(1)
    expect(page.nextCursor).toBeDefined()
    const next = await inbox.page(userId, { view: 'unread', limit: '1', cursor: page.nextCursor })
    expect(new Set([...page.groups, ...next.groups].map((g) => g.key)).size).toBe(2)
    expect([...page.groups, ...next.groups].find((g) => g.target.contextId === channelId))
      .toMatchObject({ name: 'general', serverName: 'First server', unreadCount: 100 })
    expect([...page.groups, ...next.groups].find((g) => g.target.contextId === secondChannel))
      .toMatchObject({ name: 'elsewhere', serverName: 'Second server', unreadCount: 1 })
    expect(next.nextCursor).toBeUndefined()
    expect(next.snapshotAt).toBe(page.snapshotAt)
  })

  it('deduplicates mention+direct reply and navigates to mention rather than unrelated first unread', async () => {
    const root = await message({ authorId: userId })
    await message({ createdAt: joined, content: 'An unrelated unread' })
    const reply = await message({ replyToId: root.id })
    await notification('mention', reply.id)
    await notification('reply', reply.id)
    const mentions = await inbox.page(userId, { view: 'mentions' })
    const replies = await inbox.page(userId, { view: 'replies' })
    expect(mentions.counts).toMatchObject({ mentions: 1, replies: 1 })
    expect(mentions.groups[0]).toMatchObject({
      target: { messageId: reply.id }, mentionCount: 1, replyCount: 1
    })
    expect(replies.groups[0]!.highlights.map((h) => h.messageId)).toEqual([reply.id])
  })

  it('separates root and participating threads; bounds thread ack without acknowledging channel state', async () => {
    const parent = await message({ authorId: userId, title: 'Discussion' })
    const root = await message()
    const first = await message({ threadParentId: parent.id })
    await notification('mention', root.id)
    await notification('thread_reply', first.id, { threadParentId: parent.id, count: 99 })
    await message({ threadParentId: parent.id, createdAt: newAt })
    const before = await inbox.page(userId, { view: 'replies' })
    expect(before.counts.unread).toBe(2)
    expect(before.groups[0]).toMatchObject({ unreadCount: 2, replyCount: 2 })
    await inbox.read(userId, { target: channelTarget(first.id, parent.id), throughAt: snapshot.toISOString() })
    expect(await prisma.channelReadState.findUnique({ where: { userId_channelId: { userId, channelId } } })).toBeNull()
    const rows = await prisma.inAppNotification.findMany({ where: { userId } })
    expect(rows.find((r) => r.kind === 'mention')!.readAt).toBeNull()
    expect(rows.find((r) => r.kind === 'thread_reply')!.readAt).not.toBeNull()
  })

  it('keeps coalesced newer thread activity outstanding but does not recount acknowledged thread history', async () => {
    const parent = await message({ authorId: userId })
    const first = await message({ threadParentId: parent.id })
    const next = await message({ threadParentId: parent.id, createdAt: newAt })
    const row = await notification('thread_reply', next.id, { threadParentId: parent.id, count: 99 })
    await prisma.inAppNotification.update({ where: { id: row.id }, data: { updatedAt: newAt } })
    await inbox.read(userId, { target: channelTarget(first.id, parent.id), throughAt: snapshot.toISOString() })
    expect((await prisma.inAppNotification.findUniqueOrThrow({ where: { id: row.id } })).readAt).toBeNull()
    expect((await inbox.page(userId, { view: 'unread' })).groups
      .find((g) => g.target.threadParentId === parent.id)).toMatchObject({ unreadCount: 1, replyCount: 1 })
  })

  it('does not clear thread notifications when acknowledging a channel root', async () => {
    const parent = await message({ authorId: userId })
    const reply = await message({ threadParentId: parent.id })
    const directed = await notification('mention', reply.id, { threadParentId: parent.id })
    await inbox.read(userId, { target: channelTarget(), throughAt: snapshot.toISOString() })
    expect((await prisma.inAppNotification.findUniqueOrThrow({ where: { id: directed.id } })).readAt).toBeNull()
    const page = await inbox.page(userId, { view: 'mentions' })
    expect(page.groups).toHaveLength(1)
    expect(page.groups[0]!.target.threadParentId).toBe(parent.id)
  })

  it('preserves incoming messages and coalesced channel notification newer than the frozen session', async () => {
    const first = await message()
    const session = await frozenSession()
    const next = await message({ createdAt: newAt })
    await prisma.inAppNotification.create({ data: {
      userId, kind: 'channel_message', dedupeKey: `channel:${channelId}`,
      payload: { channelId, messageId: next.id }, updatedAt: newAt
    } })
    await inbox.advance(userId, { id: session.id, revision: session.revision, action: 'done' })
    const page = await inbox.page(userId, { view: 'unread' })
    expect(page.groups[0]).toMatchObject({ unreadCount: 1, target: { messageId: next.id } })
    expect(page.groups[0]!.highlights.some((h) => h.messageId === first.id)).toBe(false)
    expect((await prisma.inAppNotification.findFirstOrThrow({ where: { userId } })).readAt).toBeNull()
  })

  it('advances DM read receipts at the actual cutoff, never backwards, and preserves own-message receipt semantics', async () => {
    await message({ channelId: null, directConversationId: dmId, authorId: userId })
    const next = await message({ channelId: null, directConversationId: dmId, createdAt: newAt })
    const receipt = jest.fn()
    const bump = jest.fn()
    events.on('dm:read', receipt)
    events.on('dm:preferences-read-state', bump)
    await inbox.read(userId, { target: dmTarget(), throughAt: snapshot.toISOString() })
    await inbox.read(userId, { target: dmTarget(), throughAt: oldAt.toISOString() })
    expect(receipt).toHaveBeenLastCalledWith({
      conversationId: dmId, userId, lastReadAt: snapshot.toISOString()
    })
    expect(bump).toHaveBeenCalledWith({ userId })
    expect((await inbox.page(userId, { view: 'unread' })).groups[0])
      .toMatchObject({ unreadCount: 1, target: { messageId: next.id } })
    const states = await readState.getAllForUser(userId)
    expect(states.dms[0]).toMatchObject({ lastReadAt: snapshot.toISOString(), unreadCount: 1, mentionCount: 1 })
  })

  it('uses effective server/channel mute preferences, filters permission before pagination, but keeps saved readable muted entries', async () => {
    const first = await message()
    const second = await message({ channelId: secondChannel })
    await notification('mention', first.id)
    await inbox.saveLater(userId, { target: channelTarget(first.id) })
    await prisma.serverMember.update({ where: { userId_serverId: { userId, serverId } }, data: { notifLevel: 'none' } })
    let page = await inbox.page(userId, { view: 'unread', limit: '1' })
    expect(page.counts).toMatchObject({ unread: 1, mentions: 0, later: 1 })
    expect(page.groups[0]!.target.messageId).toBe(second.id)
    await prisma.channelNotifPref.create({ data: { userId, channelId, level: 'mentions' } })
    expect((await inbox.page(userId, { view: 'mentions' })).counts.mentions).toBe(1)
    const role = await prisma.role.findFirstOrThrow({ where: { serverId, isDefault: true } })
    await prisma.channelPermissionOverride.create({
      data: { channelId, roleId: role.id, deny: Permission.VIEW_CHANNEL }
    })
    page = await inbox.page(userId, { view: 'later' })
    expect(page.counts).toMatchObject({ unread: 1, mentions: 0, later: 0 })
    expect(page.groups).toEqual([])
    await expect(inbox.read(userId, { target: channelTarget(first.id), throughAt: snapshot.toISOString() }))
      .rejects.toBeInstanceOf(GoneException)
  })

  it('omits muted DMs from unread while preserving saved DM metadata', async () => {
    const first = await message({ channelId: null, directConversationId: dmId })
    await inbox.saveLater(userId, { target: dmTarget(first.id) })
    await prisma.directConversationMember.update({
      where: { conversationId_userId: { conversationId: dmId, userId } }, data: { muted: true }
    })
    const page = await inbox.page(userId, { view: 'later' })
    expect(page.counts).toMatchObject({ unread: 0, later: 1 })
    expect(page.groups[0]).toMatchObject({ serverName: null, target: { mode: 'dm', messageId: first.id } })
  })

  it('persists Later independently of notification cap and read status, dedupes and removes only explicitly or on saved Done', async () => {
    const first = await message()
    await inbox.saveLater(userId, { target: channelTarget(first.id) })
    await inbox.saveLater(userId, { target: channelTarget(first.id) })
    // The bell cap trims these, without touching Later.
    await prisma.inAppNotification.createMany({ data: Array.from({ length: 510 }, (_, i) => ({
      userId, kind: 'mention' as const, dedupeKey: `old-${i}`, payload: { messageId: first.id, channelId }
    })) })
    await inApp.record([userId], { kind: 'announcement', payload: { title: 'cap trigger' } })
    expect(await prisma.inAppNotification.count({ where: { userId } })).toBeLessThanOrEqual(500)
    await inbox.read(userId, { target: channelTarget(first.id), throughAt: new Date().toISOString() })
    expect((await inbox.page(userId, { view: 'later' })).groups).toHaveLength(1)
    expect(await prisma.inboxLater.count({ where: { userId } })).toBe(1)
    const session = (await inbox.startSession(userId, { view: 'later' })).session
    await inbox.advance(userId, { id: session.id, revision: session.revision, action: 'done' })
    expect(await prisma.inboxLater.count({ where: { userId } })).toBe(0)
  })

  it('freezes all groups (not first page), reuses unfinished sessions, and anchor/Later never acknowledges reads', async () => {
    const first = await message()
    await message({ channelId: secondChannel })
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    expect(session.groups).toHaveLength(2)
    await message({ channelId: null, directConversationId: dmId })
    expect((await inbox.startSession(userId, { view: 'mentions' })).session).toEqual(session)
    const current = session.groups[0]!
    const alternate = await message({ channelId: current.target.contextId, content: 'Alternate anchor' })
    const t = { ...current.target, messageId: alternate.id }
    const anchored = await inbox.anchor(userId, { id: session.id, revision: 0, target: t })
    expect(anchored.session).toMatchObject({ revision: 1, anchor: t, index: 0 })
    const deferred = await inbox.advance(userId, { id: session.id, revision: 1, action: 'later' })
    expect(deferred.session).toMatchObject({ revision: 2, index: 1, deferred: 1, completed: 0, anchor: null })
    expect(await prisma.channelReadState.count({ where: { userId } })).toBe(0)
    expect((await inbox.page(userId, { view: 'later' })).groups[0]!.target).toEqual(t)
    expect((await inbox.getSession(userId)).session?.groups.map((g) => g.key)).toEqual(session.groups.map((g) => g.key))
    expect(first).toBeDefined()
  })

  it('rejects two-device stale revisions, wrong-context anchors, and foreign-account sessions without side effects', async () => {
    await message()
    const elsewhere = await message({ channelId: secondChannel })
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    const t = session.groups[0]!.target
    const foreign = { ...t, contextId: randomUUID() }
    await expect(inbox.anchor(userId, { id: session.id, revision: 0, target: foreign }))
      .rejects.toBeInstanceOf(BadRequestException)
    await expect(inbox.advance(outsider, { id: session.id, revision: 0, action: 'done' }))
      .rejects.toBeInstanceOf(NotFoundException)
    const results = await Promise.allSettled([
      inbox.advance(userId, { id: session.id, revision: 0, action: 'later' }),
      inbox.advance(userId, { id: session.id, revision: 0, action: 'later' })
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason)
      .toBeInstanceOf(ConflictException)
    expect(await prisma.inboxLater.count({ where: { userId } })).toBe(1)
    expect((await inbox.getSession(userId)).session?.revision).toBe(1)
    expect(elsewhere).toBeDefined()
  })

  it('loads/reuses a usable redacted queue for a deleted current entry, rejects Done and permits Skip', async () => {
    const first = await message()
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    await prisma.message.update({ where: { id: first.id }, data: { deleted: true } })
    expect((await inbox.getSession(userId)).session).toMatchObject({
      id: session.id, revision: 0, index: 0,
      groups: [{ name: 'Unavailable', serverName: null, highlights: [], unreadCount: 0, unavailable: true }]
    })
    expect((await inbox.startSession(userId, { view: 'unread' })).session).toMatchObject({
      id: session.id, revision: 0, index: 0, groups: [{ name: 'Unavailable', highlights: [], unavailable: true }]
    })
    await expect(inbox.advance(userId, { id: session.id, revision: 0, action: 'done' }))
      .rejects.toMatchObject({
        response: { code: 'INBOX_TARGET_UNAVAILABLE', id: session.id, revision: 0, index: 0 }
      })
    const skipped = await inbox.advance(userId, { id: session.id, revision: 0, action: 'skip' })
    expect(skipped.session).toMatchObject({ revision: 1, index: 1, completed: 0, deferred: 0 })
    expect(skipped.session.groups[0]!.highlights).toEqual([])
    expect(skipped.session.groups[0]).toMatchObject({ key: session.groups[0]!.key, unavailable: true })
  })

  it('redacts a deleted anchor on load without losing session metadata and keeps non-Skip validation strict', async () => {
    await message()
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    const alternate = await message()
    const anchored = (await inbox.anchor(userId, {
      id: session.id, revision: 0, target: channelTarget(alternate.id)
    })).session
    await prisma.message.update({ where: { id: alternate.id }, data: { deleted: true } })
    expect((await inbox.getSession(userId)).session).toMatchObject({
      id: session.id, revision: anchored.revision, index: 0, anchor: null,
      groups: [{ unavailable: true, name: 'Unavailable', serverName: null, highlights: [] }]
    })
    await expect(inbox.advance(userId, { id: session.id, revision: anchored.revision, action: 'later' }))
      .rejects.toMatchObject({ response: {
        code: 'INBOX_TARGET_UNAVAILABLE', message: 'Inbox target is unavailable',
        id: session.id, revision: anchored.revision, index: 0
      } })
    expect((await inbox.advance(userId, {
      id: session.id, revision: anchored.revision, action: 'skip'
    })).session).toMatchObject({ index: 1, revision: anchored.revision + 1 })
  })

  it('validates message ownership/context, deleted parents, future cutoffs and persisted JSON strictly', async () => {
    const first = await message()
    const elsewhere = await message({ channelId: secondChannel })
    await expect(inbox.saveLater(userId, { target: channelTarget(elsewhere.id) }))
      .rejects.toBeInstanceOf(GoneException)
    const parent = await message({ deleted: true })
    const child = await message({ threadParentId: parent.id })
    await expect(inbox.saveLater(userId, { target: channelTarget(child.id, parent.id) }))
      .rejects.toBeInstanceOf(GoneException)
    await expect(inbox.read(userId, { target: channelTarget(first.id), throughAt: '2999-01-01T00:00:00Z' }))
      .rejects.toBeInstanceOf(BadRequestException)
    await expect(inbox.page(userId, { view: 'unread', cursor: 'junk' })).rejects.toBeInstanceOf(BadRequestException)
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    await prisma.inboxSession.update({ where: { userId }, data: {
      payload: JSON.parse(JSON.stringify({ ...session, injected: true }))
    } })
    await expect(inbox.getSession(userId)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('never rewinds implicit membership cutoffs on the first bounded acknowledgment', async () => {
    await inbox.read(userId, { target: channelTarget(), throughAt: '2026-01-01T00:00:00Z' })
    await inbox.read(userId, { target: dmTarget(), throughAt: '2026-01-01T00:00:00Z' })
    const states = await readState.getAllForUser(userId)
    expect(states.channels.find((c) => c.channelId === channelId)?.lastReadAt).toBe(joined.toISOString())
    expect(states.dms[0]?.lastReadAt).toBe(joined.toISOString())
  })

  it('removes Later explicitly using the full DELETE-body target and keeps other accounts isolated', async () => {
    const first = await message()
    await inbox.saveLater(userId, { target: channelTarget(first.id) })
    expect((await inbox.getSession(outsider)).session).toBeNull()
    expect((await inbox.page(outsider, { view: 'later' })).groups).toEqual([])
    await expect(inbox.removeLater(outsider, { target: channelTarget(first.id) }))
      .rejects.toBeInstanceOf(GoneException)
    await inbox.removeLater(userId, { target: channelTarget(first.id) })
    expect((await inbox.page(userId, { view: 'later' })).groups).toEqual([])
  })

  it('rejects revoked session entries yet allows Skip without a read or Later side effect', async () => {
    await message()
    const session = (await inbox.startSession(userId, { view: 'unread' })).session
    const role = await prisma.role.findFirstOrThrow({ where: { serverId, isDefault: true } })
    await prisma.channelPermissionOverride.create({
      data: { channelId, roleId: role.id, deny: Permission.VIEW_CHANNEL }
    })
    expect((await inbox.getSession(userId)).session).toMatchObject({
      id: session.id, revision: 0, index: 0,
      groups: [{ name: 'Unavailable', serverName: null, highlights: [], unavailable: true }]
    })
    await expect(inbox.advance(userId, { id: session.id, revision: 0, action: 'later' }))
      .rejects.toBeInstanceOf(GoneException)
    expect((await inbox.advance(userId, { id: session.id, revision: 0, action: 'skip' })).session)
      .toMatchObject({ index: 1, revision: 1, completed: 0, deferred: 0 })
    expect(await prisma.inboxLater.count({ where: { userId } })).toBe(0)
    expect(await prisma.channelReadState.count({ where: { userId } })).toBe(0)
  })

  it('legacy channel acknowledgment still acknowledges now and resets thread unread baseline for future activity', async () => {
    const parent = await message({ authorId: userId })
    const first = await message({ threadParentId: parent.id })
    await notification('thread_reply', first.id, { threadParentId: parent.id })
    await readState.ackChannel(userId, channelId)
    const now = new Date()
    const next = await message({ threadParentId: parent.id, createdAt: new Date(now.getTime() + 5) })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await inApp.recordThreadActivity([userId], {
      serverId, channelId, channelName: 'general', threadParentId: parent.id,
      messageId: next.id, authorName: 'Other', snippet: 'New thread message'
    })
    const page = await inbox.page(userId, { view: 'replies' })
    expect(page.groups[0]).toMatchObject({ unreadCount: 1, replyCount: 1 })
  })

  it('inherits pre-feature channel read history once, then preserves independent thread unread on Inbox root reads', async () => {
    const parent = await message({ authorId: userId })
    await message({ threadParentId: parent.id })
    const firstUnread = await message({ threadParentId: parent.id, createdAt: newAt })
    await notification('thread_reply', firstUnread.id, { threadParentId: parent.id })
    await prisma.channelReadState.create({ data: { userId, channelId, lastReadAt: snapshot } })
    expect((await inbox.page(userId, { view: 'replies' })).groups[0]).toMatchObject({ unreadCount: 1 })
    await inbox.read(userId, { target: channelTarget(), throughAt: new Date().toISOString() })
    expect((await inbox.page(userId, { view: 'replies' })).groups[0]).toMatchObject({ unreadCount: 1 })
  })
})
