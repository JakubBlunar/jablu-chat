import type { Room } from 'livekit-client'

const operations = new WeakMap<Room, Promise<void>>()

/** Device changes, processing changes and mute/unmute share one capture path. */
export async function enqueueMicrophoneOperation(room: Room, operation: () => Promise<void>): Promise<void> {
  const previous = operations.get(room) ?? Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  operations.set(room, next)
  try {
    await next
  } finally {
    if (operations.get(room) === next) operations.delete(room)
  }
}
