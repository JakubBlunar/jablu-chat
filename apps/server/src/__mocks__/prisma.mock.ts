import { PrismaService } from '../prisma/prisma.service'

type MockModel = {
  findUnique: jest.Mock
  findFirst: jest.Mock
  findMany: jest.Mock
  create: jest.Mock
  update: jest.Mock
  upsert: jest.Mock
  delete: jest.Mock
  deleteMany: jest.Mock
  count: jest.Mock
  aggregate: jest.Mock
  updateMany: jest.Mock
}

function createMockModel(): MockModel {
  return {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
    updateMany: jest.fn(),
  }
}

export type MockPrismaService = {
  [K in keyof PrismaService]: PrismaService[K] extends Function ? jest.Mock : unknown
} & {
  user: MockModel
  refreshToken: MockModel
  pushSubscription: MockModel
  passwordReset: MockModel
  server: MockModel
  serverMember: MockModel
  serverMemberRole: MockModel
  serverBan: MockModel
  role: MockModel
  channelPermissionOverride: MockModel
  channelCategory: MockModel
  channel: MockModel
  directConversation: MockModel
  directConversationMember: MockModel
  message: MockModel
  poll: MockModel
  pollOption: MockModel
  pollVote: MockModel
  attachment: MockModel
  reaction: MockModel
  customEmoji: MockModel
  invite: MockModel
  webhook: MockModel
  linkPreview: MockModel
  channelNotifPref: MockModel
  registrationInvite: MockModel
  channelReadState: MockModel
  dmReadState: MockModel
  storageAudit: MockModel
  userVolumeSetting: MockModel
  auditLog: MockModel
  serverEvent: MockModel
  eventInterest: MockModel
  friendship: MockModel
  messageBookmark: MockModel
  autoModRule: MockModel
  $transaction: jest.Mock
}

export function createMockPrismaService(): MockPrismaService {
  return {
    user: createMockModel(),
    refreshToken: createMockModel(),
    pushSubscription: createMockModel(),
    passwordReset: createMockModel(),
    server: createMockModel(),
    serverMember: createMockModel(),
    serverMemberRole: createMockModel(),
    serverBan: createMockModel(),
    role: createMockModel(),
    channelPermissionOverride: createMockModel(),
    channelCategory: createMockModel(),
    channel: createMockModel(),
    directConversation: createMockModel(),
    directConversationMember: createMockModel(),
    message: createMockModel(),
    poll: createMockModel(),
    pollOption: createMockModel(),
    pollVote: createMockModel(),
    attachment: createMockModel(),
    reaction: createMockModel(),
    customEmoji: createMockModel(),
    invite: createMockModel(),
    webhook: createMockModel(),
    linkPreview: createMockModel(),
    channelNotifPref: createMockModel(),
    registrationInvite: createMockModel(),
    channelReadState: createMockModel(),
    dmReadState: createMockModel(),
    storageAudit: createMockModel(),
    userVolumeSetting: createMockModel(),
    auditLog: createMockModel(),
    serverEvent: createMockModel(),
    eventInterest: createMockModel(),
    friendship: createMockModel(),
    messageBookmark: createMockModel(),
    autoModRule: createMockModel(),
    $transaction: jest.fn((fn: (prisma: any) => Promise<any>) => fn(createMockPrismaService())),
  } as unknown as MockPrismaService
}
