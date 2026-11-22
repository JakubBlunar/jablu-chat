import { create } from 'zustand'
import type { ConversationRequest, ConversationTarget } from './conversationTarget'

type ReadingPoint = { id: string; offset: number }
let pendingRestore: { key: string; point: ReadingPoint } | undefined

export function prepareReadingRestore(key: string, point?: ReadingPoint) {
  pendingRestore = point ? { key, point } : undefined
}

export function takeReadingOffset(key: string, id: string) {
  if (key !== pendingRestore?.key || id !== pendingRestore.point.id) return
  const offset = pendingRestore.point.offset
  pendingRestore = undefined
  return offset
}

const points = new Map<string, ReadingPoint>()
export function rememberReadingPoint(key: string, point: ReadingPoint | null) {
  points.delete(key)
  if (!point) return
  points.set(key, point)
  if (points.size > 64) points.delete(points.keys().next().value!)
}
export function readingPoint(request: ConversationRequest) {
  if (
    (request.source !== 'sidebar' && request.source !== 'command') ||
    (request.position && request.position.kind !== 'unread')
  )
    return
  const target = request.target
  if (target.kind === 'channel') return points.get('channel:' + target.channelId)
  if (target.kind === 'dm') return points.get('dm:' + target.conversationId)
}
export type Visit = Extract<ConversationTarget, { kind: 'channel' | 'dm' }>
export const visitId = (t: Visit) =>
  t.kind === 'channel' ? 'nav:channel:' + t.channelId : 'nav:dm:' + t.conversationId
export const useVisits = create<{ recent: Visit[] }>(() => ({ recent: [] }))
export function recordVisit(target: ConversationTarget) {
  if (target.kind !== 'channel' && target.kind !== 'dm') return
  useVisits.setState((s) => ({
    recent: [target, ...s.recent.filter((t) => visitId(t) !== visitId(target))].slice(0, 32)
  }))
}
export function clearVisits() {
  pendingRestore = undefined
  points.clear()
  useVisits.setState({ recent: [] })
}
