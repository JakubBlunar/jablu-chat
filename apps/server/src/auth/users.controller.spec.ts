import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { isServerLayout, type ServerLayoutEntry } from '@chat/shared'
import { UsersController } from './users.controller'
import { UnifiedAuthGuard } from './unified-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { createMockPrismaService, type MockPrismaService } from '../__mocks__/prisma.mock'

const a = '00000000-0000-4000-8000-000000000001'
const b = '00000000-0000-4000-8000-000000000002'
const folderId = '00000000-0000-4000-8000-000000000003'
const folder: ServerLayoutEntry = { type: 'folder', id: folderId, name: 'Games', collapsed: true, serverIds: [b] }

describe('account server layout', () => {
  let controller: UsersController
  let prisma: MockPrismaService

  beforeEach(async () => {
    prisma = createMockPrismaService()
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: PrismaService, useValue: prisma }]
    })
      .overrideGuard(UnifiedAuthGuard)
      .useValue({ canActivate: () => true })
      .compile()
    controller = module.get(UsersController)
    prisma.serverMember.findMany.mockResolvedValue([{ serverId: a }, { serverId: b }])
    prisma.user.findUniqueOrThrow.mockResolvedValue({ serverLayout: [folder] })
  })

  it('loads only the authenticated account and appends new memberships', async () => {
    expect(await controller.getServerLayout({ id: 'me' })).toEqual([folder, { type: 'server', serverId: a }])
    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'me' },
      select: { serverLayout: true }
    })
    expect(prisma.serverMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'me' } }))
  })

  it('persists ordering, folder membership and collapsed state for this account', async () => {
    const entries: ServerLayoutEntry[] = [folder, { type: 'server', serverId: a }]
    expect(await controller.updateServerLayout({ id: 'me' }, { entries })).toEqual(entries)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'me' }, data: { serverLayout: entries } })
  })

  it('rejects references to unjoined servers without writing', async () => {
    prisma.serverMember.findMany.mockResolvedValue([{ serverId: a }])
    await expect(controller.updateServerLayout({ id: 'me' }, { entries: [folder] })).rejects.toThrow(
      BadRequestException
    )
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('removes stale memberships from cached layouts but keeps folders', async () => {
    prisma.serverMember.findMany.mockResolvedValue([{ serverId: a }])
    expect(await controller.getServerLayout({ id: 'me' })).toEqual([
      { ...folder, serverIds: [] },
      { type: 'server', serverId: a }
    ])
  })

  it.each([
    [{ type: 'server', serverId: 'not-a-uuid' }],
    [
      { type: 'server', serverId: a },
      { type: 'server', serverId: a }
    ],
    [{ type: 'server', serverId: b }, folder],
    [folder, { ...folder, serverIds: [] }],
    [{ ...folder, name: '' }],
    [{ ...folder, name: ' '.repeat(2) }],
    [{ ...folder, name: 'n'.repeat(51) }],
    [{ ...folder, collapsed: 'false' }],
    [{ ...folder, serverIds: [{ type: 'folder' }] }],
    [{ type: 'unknown' }]
  ])('rejects invalid or duplicate entries: %p', async (...entries) => {
    expect(isServerLayout(entries)).toBe(false)
    await expect(controller.updateServerLayout({ id: 'me' }, { entries })).rejects.toThrow(BadRequestException)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('enforces folder and item limits', () => {
    const folders = Array.from({ length: 101 }, (_, i) => ({
      ...folder,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      serverIds: []
    }))
    expect(isServerLayout(folders.slice(0, 100))).toBe(true)
    expect(isServerLayout(folders)).toBe(false)
    expect(isServerLayout(Array(1001).fill({ type: 'server', serverId: a }))).toBe(false)
  })
})
