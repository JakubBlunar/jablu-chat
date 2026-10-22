import type { Message } from '@chat/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { usePermissions, Permission } from '@/hooks/usePermissions'
import { buildMessageJumpPath, getMessageShareUrl } from '@/lib/messageLink'
import { copyMessageContent, shareMessageLink } from '@/lib/messageClipboard'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import { setMessagePinned } from '@/lib/messagePins'
import { toggleMessageReactionAndRemember } from '@/lib/reactions'
import { useAuthStore } from '@/stores/auth.store'
import { useBookmarkStore } from '@/stores/bookmark.store'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'
import { useThreadStore } from '@/stores/thread.store'
import { useTranslationStore } from '@/stores/translation.store'
import { showToast } from '@/stores/toast.store'

export interface MessageActionOptions {
  message: Message
  mode: 'channel' | 'dm'
  contextId: string
  onEdit?: () => void
  onReply?: () => void
  hideThreadAction?: boolean
  hidePinAction?: boolean
  hideBookmarkAction?: boolean
}

export function useMessageActionController({
  message,
  mode,
  contextId,
  onEdit,
  onReply,
  hideThreadAction,
  hidePinAction,
  hideBookmarkAction,
  onComplete
}: MessageActionOptions & { onComplete?: () => void }) {
  const { t } = useTranslation('chat')
  const isDm = mode === 'dm'
  const userId = useAuthStore((s) => s.user?.id)
  const serverId = useServerStore((s) => s.currentServerId)
  const channelLabel = useChannelStore((s) => (isDm ? null : s.channels.find((c) => c.id === contextId)?.name))
  const { has } = usePermissions(isDm ? null : serverId)
  const isAuthor = !!userId && message.authorId === userId
  const canManage = !isDm && has(Permission.MANAGE_MESSAGES)
  const { isBookmarked, toggleBookmark } = useBookmarkStore(
    useShallow((s) => ({
      isBookmarked: s.bookmarkedIds.has(message.id),
      toggleBookmark: s.toggleBookmark
    }))
  )
  const translation = useTranslationStore(
    useShallow((s) => ({
      enabled: s.capabilitiesLoaded && !!s.capabilities?.enabled,
      setupError: s.capabilitiesError || s.preferenceError,
      targetLang: s.targetLang,
      fetchCapabilities: s.fetchCapabilities,
      loadPreference: s.loadPreference,
      translate: s.translate
    }))
  )
  const { fetchCapabilities, loadPreference } = translation
  useEffect(() => {
    void fetchCapabilities()
    void loadPreference()
  }, [fetchCapabilities, loadPreference])
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const complete = () => {
    if (mounted.current) onComplete?.()
  }
  const [reactionPending, setReactionPending] = useState(false)
  const reactionInFlight = useRef(false)

  const shareableUrl = useMemo(() => {
    const location = { messageId: message.id, threadParentId: message.threadParentId }
    if (isDm) return getMessageShareUrl(buildMessageJumpPath('dm', { ...location, conversationId: contextId }))
    return serverId
      ? getMessageShareUrl(buildMessageJumpPath('channel', { ...location, serverId, channelId: contextId }))
      : null
  }, [isDm, serverId, contextId, message.id, message.threadParentId])

  async function copyLink(url = shareableUrl) {
    if (url && (await copyMessageContent(url, true))) complete()
  }
  async function copyText() {
    if (message.content && (await copyMessageContent(message.content))) complete()
  }
  async function share() {
    if (
      shareableUrl &&
      (await shareMessageLink(
        shareableUrl,
        isDm ? t('directMessage') : t('messageShareTitle', { channel: `#${channelLabel ?? 'channel'}` })
      ))
    )
      complete()
  }
  async function pin() {
    try {
      await setMessagePinned(mode, contextId, message.id, !message.pinned)
      complete()
    } catch (error) {
      console.error('Failed to update message pin', error)
      showToast(t('pinnedMessagesTitle'), t('pinActionFailed'))
    }
  }
  async function bookmark() {
    try {
      await toggleBookmark(message.id)
      complete()
    } catch (error) {
      console.error('Failed to update saved message', error)
      showToast(t('savedMessagesTitle'), t('bookmarkActionFailed'))
    }
  }
  function translate(chooseLanguage: () => void) {
    if (!translation.targetLang) {
      chooseLanguage()
      return
    }
    void translation.translate(message.id, translation.targetLang, messageTranslationVersion(message)).then((error) => {
      if (error) showToast(t('translateErrorTitle'), t('translateErrorMessage'))
      else complete()
    })
  }
  async function react(emoji: string, isCustom = false): Promise<boolean> {
    if (reactionInFlight.current) return false
    reactionInFlight.current = true
    setReactionPending(true)
    try {
      const success = await toggleMessageReactionAndRemember({ mode, messageId: message.id, emoji, isCustom })
      if (success) complete()
      return success
    } finally {
      reactionInFlight.current = false
      if (mounted.current) setReactionPending(false)
    }
  }

  return {
    serverId,
    isDm,
    isBookmarked,
    shareableUrl,
    reactionPending,
    canEdit: isAuthor && !!onEdit,
    canDelete: isAuthor || canManage,
    canPin: !hidePinAction && (isDm || canManage),
    canBookmark: !hideBookmarkAction,
    canForward: !isDm && !!serverId,
    canThread: !hideThreadAction && !isDm && !message.threadParentId,
    canTranslate: !!message.content && translation.enabled,
    translationSetupError: translation.setupError,
    retryTranslation: () => {
      void Promise.all([fetchCapabilities(), loadPreference()])
    },
    copyLink,
    copyText,
    share,
    pin,
    bookmark,
    translate,
    react,
    reply: () => {
      onReply?.()
      complete()
    },
    edit: () => {
      onEdit?.()
      complete()
    },
    thread: () => {
      useThreadStore.getState().openThread(contextId, message)
      complete()
    }
  }
}
