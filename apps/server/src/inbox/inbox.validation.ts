import { BadRequestException } from '@nestjs/common'
import type { InboxGroup, InboxSession, InboxTarget, InboxView } from '@chat/shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const INBOX_VIEWS: InboxView[] = ['unread', 'mentions', 'replies', 'later']

export function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))) {
    throw new BadRequestException('Invalid inbox object')
  }
  return value as Record<string, unknown>
}

export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new BadRequestException('Invalid inbox ID')
  return value
}

export function isoDate(value: unknown): string {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
    !Number.isFinite(Date.parse(value))) throw new BadRequestException('Invalid inbox date')
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! ||
    Number(value.slice(11, 13)) > 23) throw new BadRequestException('Invalid inbox date')
  return new Date(value).toISOString()
}

export function view(value: unknown): InboxView {
  if (!INBOX_VIEWS.includes(value as InboxView)) throw new BadRequestException('Invalid inbox view')
  return value as InboxView
}

export function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BadRequestException('Invalid inbox revision or count')
  }
  return value
}

export function target(value: unknown): InboxTarget {
  const row = object(value, ['mode', 'contextId', 'serverId', 'threadParentId', 'messageId'])
  if (row.mode !== 'channel' && row.mode !== 'dm') throw new BadRequestException('Invalid inbox mode')
  if (row.mode === 'channel' && row.serverId === null) throw new BadRequestException('Channel requires a server')
  if (row.mode === 'dm' && (row.serverId !== null || row.threadParentId !== null)) {
    throw new BadRequestException('Invalid DM target')
  }
  return {
    mode: row.mode,
    contextId: uuid(row.contextId),
    serverId: row.serverId === null ? null : uuid(row.serverId),
    threadParentId: row.threadParentId === null ? null : uuid(row.threadParentId),
    messageId: row.messageId === null ? null : uuid(row.messageId)
  }
}

export function groupKey(value: InboxTarget): string {
  return `${value.mode}:${value.contextId}:${value.threadParentId ?? 'root'}`
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException('Invalid inbox text')
  return value
}

function group(value: unknown): InboxGroup {
  const row = object(value, ['key', 'target', 'name', 'serverName', 'unreadCount', 'mentionCount',
    'replyCount', 'latestAt', 'highlights', 'savedAt', 'unavailable'])
  const parsedTarget = target(row.target)
  if (row.key !== groupKey(parsedTarget) || !Array.isArray(row.highlights)) {
    throw new BadRequestException('Invalid inbox group')
  }
  if (row.highlights.length > 3) throw new BadRequestException('Too many inbox highlights')
  if (row.unavailable !== undefined && typeof row.unavailable !== 'boolean') {
    throw new BadRequestException('Invalid inbox availability')
  }
  return {
    key: row.key as string, target: parsedTarget, name: text(row.name),
    serverName: row.serverName === null ? null : text(row.serverName),
    unreadCount: integer(row.unreadCount), mentionCount: integer(row.mentionCount),
    replyCount: integer(row.replyCount), latestAt: isoDate(row.latestAt),
    savedAt: row.savedAt === null ? null : isoDate(row.savedAt),
    ...(row.unavailable !== undefined ? { unavailable: row.unavailable as boolean } : {}),
    highlights: row.highlights.map((entry) => {
      const item = object(entry, ['messageId', 'authorName', 'snippet', 'kind', 'createdAt'])
      if (!['mention', 'reply', 'thread_reply', 'message'].includes(item.kind as string)) {
        throw new BadRequestException('Invalid inbox highlight')
      }
      return {
        messageId: uuid(item.messageId), authorName: text(item.authorName), snippet: text(item.snippet),
        kind: item.kind as InboxGroup['highlights'][number]['kind'], createdAt: isoDate(item.createdAt)
      }
    })
  }
}

export function storedSession(value: unknown): InboxSession {
  const row = object(value, ['id', 'revision', 'view', 'snapshotAt', 'groups', 'index', 'completed',
    'deferred', 'anchor'])
  if (!Array.isArray(row.groups)) throw new BadRequestException('Invalid inbox session groups')
  const result: InboxSession = {
    id: uuid(row.id), revision: integer(row.revision), view: view(row.view),
    snapshotAt: isoDate(row.snapshotAt), groups: row.groups.map(group),
    index: integer(row.index), completed: integer(row.completed), deferred: integer(row.deferred),
    anchor: row.anchor === null ? null : target(row.anchor)
  }
  if (result.index > result.groups.length || result.completed + result.deferred > result.index ||
    new Set(result.groups.map((g) => g.key)).size !== result.groups.length ||
    result.groups.some((g) => new Set(g.highlights.map((h) => h.messageId)).size !== g.highlights.length) ||
    (result.anchor && (!result.anchor.messageId || !result.groups[result.index] ||
      groupKey(result.anchor) !== result.groups[result.index]!.key ||
      result.anchor.serverId !== result.groups[result.index]!.target.serverId))) {
    throw new BadRequestException('Invalid inbox session state')
  }
  return result
}
