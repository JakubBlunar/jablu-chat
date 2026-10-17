import i18n from 'i18next'
import { showToast } from '@/stores/toast.store'

export async function copyMessageContent(text: string, link = false): Promise<boolean> {
  try {
    if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(text)
    showToast(
      i18n.t(link ? 'chat:messageLinkCopied' : 'chat:messageCopied'),
      i18n.t(link ? 'chat:messageLinkCopiedHint' : 'chat:messageCopiedHint')
    )
    return true
  } catch (error) {
    console.error('Could not copy message content', error)
    showToast(i18n.t('chat:messageCopyFailed'), i18n.t('chat:messageCopyFailedHint'))
    return false
  }
}

export async function shareMessageLink(url: string, title: string): Promise<boolean> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return true
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return false
      console.error('Could not share message; offering clipboard instead', error)
    }
  }
  return copyMessageContent(url, true)
}
