import type { Message } from '@chat/shared'

/** Includes content so history reloads and optimistic edits also invalidate translations. */
export function messageTranslationVersion(message: Pick<Message, 'content' | 'editedAt'>): string {
  return JSON.stringify([message.content, message.editedAt])
}
