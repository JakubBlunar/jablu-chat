import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DmService } from '../dm/dm.service'
import { PrismaService } from '../prisma/prisma.service'
import { DmCallsService } from './dm-calls.service'
import { VoiceService } from './voice.service'
import { NotificationsService } from '../notifications/notifications.service'

const alice = { id: 'alice', username: 'alice', displayName: 'Alice' }
const bob = { id: 'bob', username: 'bob', displayName: null }
const carol = { id: 'carol', username: 'carol', displayName: null }

describe('DmCallsService', () => {
  let calls: DmCallsService
  const membership = jest.fn()
  const members = jest.fn()
  const emit = jest.fn()
  const dispatch = jest.fn()
  const voice = {
    isConfigured: true,
    generateDmToken: jest.fn().mockResolvedValue({ token: 'token', url: 'wss://voice.test' }),
    deleteDmRoom: jest.fn().mockResolvedValue(undefined)
  }

  beforeEach(async () => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    dispatch.mockResolvedValue(undefined)
    membership.mockResolvedValue({})
    members.mockResolvedValue([alice, bob].map((user) => ({ userId: user.id, user: { isBot: false } })))
    voice.isConfigured = true
    const module = await Test.createTestingModule({
      providers: [
        DmCallsService,
        { provide: DmService, useValue: { requireMembership: membership } },
        { provide: PrismaService, useValue: { directConversationMember: { findMany: members } } },
        { provide: VoiceService, useValue: voice },
        { provide: NotificationsService, useValue: { dispatch } }
      ]
    }).compile()
    calls = module.get(DmCallsService)
    calls.setEmitter(emit)
  })

  afterEach(() => {
    calls.onModuleDestroy()
    jest.useRealTimers()
  })

  it('rings other members and admits only the caller initially', async () => {
    const call = await calls.start('dm', alice, 'a')
    expect(call.participants).toEqual([{ userId: 'alice', username: 'Alice' }])
    expect(call.ringingUserIds).toEqual(['bob'])
    expect(emit).toHaveBeenCalledWith(['alice', 'bob'], 'dm:call:update', call)
    expect(membership).toHaveBeenCalledWith('dm', 'alice')
  })

  it('refuses nonmembers and unconfigured voice', async () => {
    membership.mockRejectedValueOnce(new ForbiddenException('not a member'))
    await expect(calls.start('dm', alice, 'a')).rejects.toThrow('not a member')
    expect(emit).not.toHaveBeenCalled()
    voice.isConfigured = false
    await expect(calls.start('dm', alice, 'a')).rejects.toThrow('Voice is not configured')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('sends an exact-call invitation to human invitees, not the caller or bots', async () => {
    members.mockResolvedValueOnce([
      ...[alice, bob, carol].map((user) => ({ userId: user.id, user: { isBot: false } })),
      { userId: 'bot', user: { isBot: true } }
    ])
    const call = await calls.start('group', alice, 'a')
    expect(dispatch).toHaveBeenCalledWith({
      userIds: ['bob', 'carol'],
      kind: 'dm_call',
      dedupeKey: `dm-call:${call.id}`,
      payload: { conversationId: 'group', callId: call.id, authorName: 'Alice' },
      title: 'Incoming voice call',
      body: 'Alice is calling. Open Jablu to join.',
      url: `/channels/@me/group?call=${call.id}`,
      push: true,
      expiresAt: Date.now() + 30_000
    })
  })

  it('does not wait for notification delivery before acknowledging a call', async () => {
    dispatch.mockReturnValueOnce(new Promise(() => {}))
    const call = await calls.start('dm', alice, 'a')
    expect(call.ringingUserIds).toEqual(['bob'])
    await expect(calls.token(call.id, alice)).resolves.toBeDefined()
  })

  it('keeps the call usable if notification dispatch fails', async () => {
    dispatch.mockRejectedValueOnce(new Error('notification transport failed'))
    const call = await calls.start('dm', alice, 'a')
    await expect(calls.accept(call.id, bob, 'b')).resolves.toMatchObject({ id: call.id })
  })

  it('does not start calls to bots', async () => {
    members.mockResolvedValueOnce([
      { userId: 'alice', user: { isBot: false } },
      { userId: 'bot', user: { isBot: true } }
    ])
    await expect(calls.start('dm', alice, 'a')).rejects.toThrow('At least two people')
  })

  it('requires accepting the call before issuing a token and checks membership again', async () => {
    const call = await calls.start('dm', alice, 'a')
    await expect(calls.token(call.id, bob)).rejects.toThrow('Accept the call')
    await calls.accept(call.id, bob, 'b')
    await calls.token(call.id, bob)
    expect(voice.generateDmToken).toHaveBeenCalledWith('bob', 'bob', call.id)
    membership.mockRejectedValueOnce(new ForbiddenException('removed'))
    await expect(calls.token(call.id, bob)).rejects.toThrow('removed')
  })

  it('clears ringing on all devices when a member accepts and prevents a second device joining', async () => {
    const call = await calls.start('dm', alice, 'a')
    const accepted = await calls.accept(call.id, bob, 'b')
    expect(accepted.ringingUserIds).toEqual([])
    expect(accepted.participants).toHaveLength(2)
    await expect(calls.accept(call.id, bob, 'b2')).rejects.toThrow('another device')
    calls.leaveSocket('b2')
    expect((await calls.token(call.id, bob)).token).toBe('token')
  })

  it('ends a declined one-to-one call and revokes token access', async () => {
    const call = await calls.start('dm', alice, 'a')
    await calls.decline(call.id, 'bob')
    expect(emit).toHaveBeenCalledWith(
      ['alice', 'bob'],
      'dm:call:ended',
      expect.objectContaining({ reason: 'declined' })
    )
    await expect(calls.token(call.id, alice)).rejects.toThrow('ended')
    expect(voice.deleteDmRoom).toHaveBeenCalledWith(call.id)
  })

  it('does not cancel a group call when only one invited member declines', async () => {
    members.mockResolvedValue([alice, bob, carol].map((user) => ({ userId: user.id, user: { isBot: false } })))
    const call = await calls.start('group', alice, 'a')
    await calls.decline(call.id, 'bob')
    const accepted = await calls.accept(call.id, carol, 'c')
    expect(accepted.participants).toHaveLength(2)
    expect(accepted.ringingUserIds).toEqual([])
    jest.advanceTimersByTime(30_000)
    await expect(calls.token(call.id, carol)).resolves.toMatchObject({ token: 'token' })
  })

  it('stops unanswered ringing after 30 seconds', async () => {
    const call = await calls.start('dm', alice, 'a')
    jest.advanceTimersByTime(29_999)
    await expect(calls.token(call.id, alice)).resolves.toBeDefined()
    jest.advanceTimersByTime(1)
    await expect(calls.accept(call.id, bob, 'b')).rejects.toThrow('ended')
    expect(emit).toHaveBeenCalledWith(['alice', 'bob'], 'dm:call:ended', expect.objectContaining({ reason: 'timeout' }))
  })

  it('clears remaining group invitations at the deadline without ending an answered call', async () => {
    members.mockResolvedValue([alice, bob, carol].map((user) => ({ userId: user.id, user: { isBot: false } })))
    const call = await calls.start('group', alice, 'a')
    await calls.accept(call.id, bob, 'b')
    jest.advanceTimersByTime(30_000)
    expect(emit).toHaveBeenLastCalledWith(
      ['alice', 'bob', 'carol'],
      'dm:call:update',
      expect.objectContaining({ ringingUntil: null, ringingUserIds: [], participants: expect.any(Array) })
    )
    await expect(calls.accept(call.id, carol, 'c')).resolves.toBeDefined()
  })

  it('ends calls on caller cancellation and socket loss', async () => {
    const call = await calls.start('dm', alice, 'a')
    calls.leaveSocket('a')
    await expect(calls.token(call.id, alice)).rejects.toThrow('ended')
    const next = await calls.start('dm', alice, 'a')
    await calls.accept(next.id, bob, 'b')
    await calls.leave(next.id, 'bob', 'b')
    await expect(calls.token(next.id, alice)).rejects.toThrow('ended')
  })

  it('prevents overlapping starts, including simultaneous requests', async () => {
    const results = await Promise.allSettled([calls.start('dm', alice, 'a'), calls.start('dm', bob, 'b')])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    await expect(calls.start('other-dm', alice, 'a2')).rejects.toThrow('current call')
  })

  it('does not accept a call that ended while membership was being checked', async () => {
    const call = await calls.start('dm', alice, 'a')
    let resolve!: (value: object) => void
    membership.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      })
    )
    const accept = calls.accept(call.id, bob, 'b')
    calls.leaveSocket('a')
    resolve({})
    await expect(accept).rejects.toThrow('ended')
  })

  it('only lets the joined socket change participant state or leave', async () => {
    const call = await calls.start('dm', alice, 'a')
    await expect(calls.state(call.id, 'alice', 'other', { muted: true })).rejects.toThrow('not joined')
    await expect(calls.leave(call.id, 'alice', 'other')).rejects.toThrow('not joined')
    await calls.state(call.id, 'alice', 'a', { muted: true, camera: true })
    expect(emit).toHaveBeenLastCalledWith(
      ['alice', 'bob'],
      'dm:call:update',
      expect.objectContaining({ participants: [{ userId: 'alice', username: 'Alice', muted: true, camera: true }] })
    )
  })

  it('only synchronizes conversations the user currently belongs to', async () => {
    const call = await calls.start('dm', alice, 'a')
    members.mockResolvedValueOnce([{ conversationId: 'other' }])
    expect(await calls.sync('stranger')).toEqual([])
    members.mockResolvedValueOnce([{ conversationId: 'dm' }])
    expect(await calls.sync('bob')).toEqual([call])
  })
})
