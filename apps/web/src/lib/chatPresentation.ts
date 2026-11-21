type Mode = 'channel' | 'dm'
const surfaces = new Map<string, () => boolean>()

function key(mode: Mode, id: string, threadId?: string | null) {
  return `${mode}:${id}:${threadId ?? ''}`
}

export function registerChatPresentation(mode: Mode, id: string, threadId: string | null, isLive: () => boolean) {
  const scope = key(mode, id, threadId)
  surfaces.set(scope, isLive)
  return () => {
    if (surfaces.get(scope) === isLive) surfaces.delete(scope)
  }
}

export function isPresentingLiveChat(mode: Mode, id: string, threadId?: string | null): boolean {
  return surfaces.get(key(mode, id, threadId))?.() ?? false
}
