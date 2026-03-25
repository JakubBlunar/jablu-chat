import { PrismaClient, ChannelType, ServerRole, AttachmentType } from '@prisma/client'
import { faker } from '@faker-js/faker'
import * as bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { randomUUID, randomFillSync } from 'crypto'
import { mkdirSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'

const prisma = new PrismaClient()

const SEED_SERVER_NAME = '[Seed] Test Server'
const SEED_EMAIL_DOMAIN = '@seed.local'

const CHANNEL_NAMES = [
  'random',
  'dev-talk',
  'memes',
  'off-topic',
  'music',
  'gaming',
  'announcements',
  'help',
  'design',
  'feedback'
]

const REACTION_EMOJI = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '😊', '🤔', '💯', '✅']

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  return v ? parseInt(v, 10) : fallback
}

function envFloat(key: string, fallback: number): number {
  const v = process.env[key]
  return v ? parseFloat(v) : fallback
}

function randomDate(daysBack: number): Date {
  const now = Date.now()
  return new Date(now - Math.random() * daysBack * 24 * 3600_000)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function generateAttachmentFile(
  uploadDir: string,
  targetBytes: number
): Promise<{ filename: string; url: string; thumbnailUrl: string; sizeBytes: number; width: number; height: number }> {
  const id = randomUUID()
  const filename = `${id}.jpg`
  const thumbFilename = `${id}_thumb.webp`

  const attachDir = join(uploadDir, 'attachments')
  const thumbDir = join(uploadDir, 'thumbnails')
  if (!existsSync(attachDir)) mkdirSync(attachDir, { recursive: true })
  if (!existsSync(thumbDir)) mkdirSync(thumbDir, { recursive: true })

  const filePath = join(attachDir, filename)
  const thumbPath = join(thumbDir, thumbFilename)

  const pixelCount = Math.max(100 * 100, Math.round(targetBytes * 0.4))
  const side = Math.min(4000, Math.max(100, Math.round(Math.sqrt(pixelCount))))
  const rawBuf = Buffer.alloc(side * side * 3)
  randomFillSync(rawBuf)

  await sharp(rawBuf, { raw: { width: side, height: side, channels: 3 } })
    .jpeg({ quality: 80 })
    .toFile(filePath)

  await sharp(filePath).resize(200, 200, { fit: 'cover' }).webp({ quality: 60 }).toFile(thumbPath)

  const actualSize = statSync(filePath).size

  return {
    filename,
    url: `/api/uploads/attachments/${filename}`,
    thumbnailUrl: `/api/uploads/thumbnails/${thumbFilename}`,
    sizeBytes: actualSize,
    width: side,
    height: side
  }
}

async function main() {
  const USERS = envInt('SEED_USERS', 10)
  const EXTRA_CHANNELS = envInt('SEED_CHANNELS', 3)
  const MESSAGES = envInt('SEED_MESSAGES', 200)
  const DM_CONVOS = envInt('SEED_DM_CONVERSATIONS', 5)
  const DM_MSGS = envInt('SEED_DM_MESSAGES', 20)
  const ATTACH_RATIO = envFloat('SEED_ATTACHMENT_RATIO', 0.3)
  const TARGET_SIZE_MB = envFloat('SEED_TARGET_SIZE_MB', 400)
  const PASSWORD = env('SEED_PASSWORD', 'password123')
  const UPLOAD_DIR = resolve(env('UPLOAD_DIR', './uploads'))
  const REAL_EMAIL = env('SEED_REAL_EMAIL', '')

  console.log('=== Jablu Seed Script ===')
  console.log(`  Users: ${USERS}, Messages: ${MESSAGES}, Target size: ${TARGET_SIZE_MB} MB`)
  console.log(`  DM conversations: ${DM_CONVOS}, DM messages/convo: ${DM_MSGS}`)
  console.log(`  Attachment ratio: ${ATTACH_RATIO}, Password: ${PASSWORD}`)
  if (REAL_EMAIL) console.log(`  Real user for DMs: ${REAL_EMAIL}`)
  console.log()

  // --- Phase 1: Users ---
  let users: { id: string; username: string }[]
  const existingUsers = await prisma.user.findMany({
    where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
    select: { id: true, username: true }
  })

  if (existingUsers.length > 0) {
    console.log(`Found ${existingUsers.length} existing seed users, reusing them.`)
    users = existingUsers
  } else {
    console.log(`Creating ${USERS} users...`)
    const passwordHash = await bcrypt.hash(PASSWORD, 12)
    const userData: { username: string; email: string; passwordHash: string }[] = []
    const usedNames = new Set<string>()

    for (let i = 0; i < USERS; i++) {
      let username: string
      do {
        username = faker.internet
          .username()
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 28)
      } while (usedNames.has(username.toLowerCase()))
      usedNames.add(username.toLowerCase())

      userData.push({
        username,
        email: `${username.toLowerCase()}${SEED_EMAIL_DOMAIN}`,
        passwordHash
      })
    }

    await prisma.user.createMany({ data: userData })
    users = await prisma.user.findMany({
      where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
      select: { id: true, username: true }
    })
    console.log(`  Created ${users.length} users.`)
  }

  // --- Phase 2: Server ---
  let server = await prisma.server.findFirst({ where: { name: SEED_SERVER_NAME } })
  let textChannels: { id: string; name: string }[]

  if (server) {
    console.log(`Found existing seed server "${SEED_SERVER_NAME}", reusing.`)
    textChannels = await prisma.channel.findMany({
      where: { serverId: server.id, type: ChannelType.text },
      select: { id: true, name: true }
    })
  } else {
    console.log(`Creating server "${SEED_SERVER_NAME}"...`)
    const owner = users[0]

    server = await prisma.server.create({
      data: {
        name: SEED_SERVER_NAME,
        ownerId: owner.id,
        members: {
          create: users.map((u, i) => ({
            userId: u.id,
            role: i === 0 ? ServerRole.owner : ServerRole.member
          }))
        },
        channels: {
          create: [
            { name: 'general', type: ChannelType.text, position: 0 },
            { name: 'General', type: ChannelType.voice, position: 1 },
            ...CHANNEL_NAMES.slice(0, EXTRA_CHANNELS).map((name, i) => ({
              name,
              type: ChannelType.text,
              position: i + 2
            }))
          ]
        }
      }
    })

    textChannels = await prisma.channel.findMany({
      where: { serverId: server.id, type: ChannelType.text },
      select: { id: true, name: true }
    })
    console.log(`  Created server with ${textChannels.length} text channels.`)
  }

  // --- Phase 3: Channel messages ---
  console.log(`Generating ${MESSAGES} channel messages...`)
  const totalAttachments = Math.round(MESSAGES * ATTACH_RATIO)
  const targetBytesPerFile =
    TARGET_SIZE_MB > 0 ? Math.round((TARGET_SIZE_MB * 1024 * 1024) / Math.max(1, totalAttachments)) : 0

  const attachmentIndices = new Set<number>()
  while (attachmentIndices.size < totalAttachments) {
    attachmentIndices.add(Math.floor(Math.random() * MESSAGES))
  }

  const channelMessageIds: Map<string, string[]> = new Map()
  for (const ch of textChannels) {
    channelMessageIds.set(ch.id, [])
  }

  let attachmentsCreated = 0
  let totalDiskBytes = 0

  const sortedDates = Array.from({ length: MESSAGES }, () => randomDate(30)).sort((a, b) => a.getTime() - b.getTime())

  for (let i = 0; i < MESSAGES; i++) {
    const channel = pick(textChannels)
    const author = pick(users)
    const createdAt = sortedDates[i]
    const existingInChannel = channelMessageIds.get(channel.id)!

    let replyToId: string | undefined
    if (existingInChannel.length > 0 && Math.random() < 0.1) {
      replyToId = pick(existingInChannel)
    }

    const hasAttachment = attachmentIndices.has(i)
    let attachmentData: Awaited<ReturnType<typeof generateAttachmentFile>> | null = null

    if (hasAttachment && targetBytesPerFile > 0) {
      attachmentData = await generateAttachmentFile(UPLOAD_DIR, targetBytesPerFile)
      totalDiskBytes += attachmentData.sizeBytes
    }

    const msg = await prisma.message.create({
      data: {
        channelId: channel.id,
        authorId: author.id,
        content: hasAttachment && Math.random() < 0.3 ? null : faker.lorem.sentences({ min: 1, max: 3 }),
        replyToId,
        createdAt,
        attachments: attachmentData
          ? {
              create: {
                uploaderId: author.id,
                filename: attachmentData.filename,
                url: attachmentData.url,
                type: AttachmentType.image,
                mimeType: 'image/jpeg',
                sizeBytes: attachmentData.sizeBytes,
                width: attachmentData.width,
                height: attachmentData.height,
                thumbnailUrl: attachmentData.thumbnailUrl,
                createdAt
              }
            }
          : undefined
      }
    })

    existingInChannel.push(msg.id)

    if (hasAttachment) attachmentsCreated++

    if (Math.random() < 0.2) {
      const reactionCount = 1 + Math.floor(Math.random() * 3)
      const reactors = faker.helpers.arrayElements(users, Math.min(reactionCount, users.length))
      const usedEmoji = new Set<string>()

      for (const reactor of reactors) {
        let emoji: string
        do {
          emoji = pick(REACTION_EMOJI)
        } while (usedEmoji.has(`${reactor.id}:${emoji}`))
        usedEmoji.add(`${reactor.id}:${emoji}`)

        await prisma.reaction
          .create({
            data: {
              messageId: msg.id,
              userId: reactor.id,
              emoji,
              createdAt
            }
          })
          .catch(() => {})
      }
    }

    if ((i + 1) % 50 === 0) {
      const pct = Math.round(((i + 1) / MESSAGES) * 100)
      const mb = (totalDiskBytes / (1024 * 1024)).toFixed(1)
      console.log(`  ${i + 1}/${MESSAGES} messages (${pct}%) — ${attachmentsCreated} attachments, ${mb} MB on disk`)
    }
  }

  console.log(
    `  Done: ${MESSAGES} messages, ${attachmentsCreated} attachments, ${(totalDiskBytes / (1024 * 1024)).toFixed(1)} MB on disk.`
  )

  // --- Phase 4: DM conversations ---
  console.log(`Generating DM conversations...`)

  let realUser: { id: string; username: string } | null = null
  if (REAL_EMAIL) {
    const found = await prisma.user.findUnique({
      where: { email: REAL_EMAIL },
      select: { id: true, username: true }
    })
    if (found) {
      realUser = found
      console.log(`  Found real user "${found.username}" for DMs.`)
    } else {
      console.log(`  Warning: real user with email "${REAL_EMAIL}" not found, skipping real-user DMs.`)
    }
  }

  const dmPool = [...users]
  if (realUser) dmPool.push(realUser)

  if (dmPool.length < 2) {
    console.log('  Skipping DMs: need at least 2 users.')
  } else {
    const pairs: [string, string][] = []
    const pairSet = new Set<string>()

    const allDmUserIds = dmPool.map((u) => u.id)
    const existingDMs = await prisma.directConversation.findMany({
      where: {
        isGroup: false,
        members: { some: { userId: { in: allDmUserIds } } }
      },
      include: { members: { select: { userId: true } } }
    })

    for (const dm of existingDMs) {
      const ids = dm.members.map((m) => m.userId).sort()
      if (ids.length === 2) pairSet.add(ids.join(':'))
    }

    if (realUser) {
      const realDmCount = Math.min(3, users.length)
      const realPartners = faker.helpers.arrayElements(users, realDmCount)
      for (const partner of realPartners) {
        const key = [realUser.id, partner.id].sort().join(':')
        if (pairSet.has(key)) continue
        pairSet.add(key)
        pairs.push([realUser.id, partner.id])
      }
    }

    let attempts = 0
    while (pairs.length < DM_CONVOS && attempts < DM_CONVOS * 10) {
      attempts++
      const a = pick(users)
      const b = pick(users)
      if (a.id === b.id) continue
      const key = [a.id, b.id].sort().join(':')
      if (pairSet.has(key)) continue
      pairSet.add(key)
      pairs.push([a.id, b.id])
    }

    for (const [userA, userB] of pairs) {
      const convo = await prisma.directConversation.create({
        data: {
          members: {
            create: [{ userId: userA }, { userId: userB }]
          }
        }
      })

      const dmDates = Array.from({ length: DM_MSGS }, () => randomDate(30)).sort((a, b) => a.getTime() - b.getTime())

      for (let i = 0; i < DM_MSGS; i++) {
        await prisma.message.create({
          data: {
            directConversationId: convo.id,
            authorId: Math.random() < 0.5 ? userA : userB,
            content: faker.lorem.sentences({ min: 1, max: 2 }),
            createdAt: dmDates[i]
          }
        })
      }
    }

    const realDmCount = realUser ? pairs.filter(([a, b]) => a === realUser!.id || b === realUser!.id).length : 0
    console.log(`  Created ${pairs.length} DM conversations with ${DM_MSGS} messages each.`)
    if (realDmCount > 0) {
      console.log(`  Including ${realDmCount} conversations with your account (${realUser!.username}).`)
    }
  }

  // --- Summary ---
  console.log()
  console.log('=== Seed Complete ===')
  console.log(`  Server: "${SEED_SERVER_NAME}"`)
  console.log(`  Users: ${users.length} (login with any username + password "${PASSWORD}")`)
  console.log(`  Channels: ${textChannels.map((c) => '#' + c.name).join(', ')}`)
  console.log(`  Channel messages: ${MESSAGES} (${attachmentsCreated} with attachments)`)
  if (totalDiskBytes > 0) {
    console.log(`  Disk usage: ${(totalDiskBytes / (1024 * 1024)).toFixed(1)} MB`)
  }
  console.log(`  DM conversations: ${DM_CONVOS}`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
