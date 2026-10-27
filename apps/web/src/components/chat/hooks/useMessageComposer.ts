import { type ChatInputBarHandle, type MentionChannel, type MentionMember } from '@/components/chat/ChatInputBar'
import { useBotCommands } from '@/components/chat/useBotCommands'
import { usePermissions } from '@/hooks/usePermissions'
import { api } from '@/lib/api'
import { findOversizedAttachment } from '@/lib/attachmentLimits'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useComposerPrefillStore } from '@/stores/composer-prefill.store'
import { useDmStore } from '@/stores/dm.store'
import { composerKey, EMPTY_DRAFT_FILES, flushDraftPersistence, useDraftStore } from '@/stores/draft.store'
import { EMPTY_EMOJIS, useEmojiStore } from '@/stores/emoji.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { OutboxActionError, useOutboxStore } from '@/stores/outbox.store'
import { useThreadStore } from '@/stores/thread.store'
import type { Message } from '@chat/shared'
import { MAX_MESSAGE_LENGTH, Permission } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveTextCommand } from '../composerCommands'
import type { MessageComposerProps } from '../composerTypes'
const EDIT_LOOKBACK = 10
export function useMessageComposer({
  mode,
  contextId,
  replyTarget,
  onCancelReply,
  onSent,
  channels,
  onCommand,
  threadParentId
}: MessageComposerProps) {
  const { t } = useTranslation('chat')
  const isDm = mode === 'dm'
  const inputRef = useRef<ChatInputBarHandle>(null)
  const userId = useAuthStore((s) => s.user?.id)
  const draftKey = composerKey(userId ?? '', mode, contextId, threadParentId)
  const value = useDraftStore((s) => s.drafts[draftKey]?.text ?? '')
  const files = useDraftStore((s) => s.files[draftKey] ?? EMPTY_DRAFT_FILES)
  const draftError = useDraftStore((s) => s.error)
  const restoringFiles = useDraftStore((s) => !!s.drafts[draftKey]?.fileCount && !s.files[draftKey])
  const setValue = useCallback((text: string) => useDraftStore.getState().update(draftKey, { text }), [draftKey])
  const setTargetBot = useCallback(
    (bot: { botAppId: string; commandName: string } | null) => useDraftStore.getState().update(draftKey, { bot }),
    [draftKey]
  )
  const targetBot = useDraftStore((s) => s.drafts[draftKey]?.bot ?? null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [dragOver, setDragOver] = useState(false)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const [maxUploadMb, setMaxUploadMb] = useState<number | null>(null)
  const [limitFailed, setLimitFailed] = useState(false)
  const [limitAttempt, setLimitAttempt] = useState(0)
  useEffect(() => {
    if (!files.length) return
    let cancelled = false
    const check = () => {
      void api.getMaxUploadSizeMb().then(
        (max) => {
          if (!cancelled) {
            setMaxUploadMb(max)
            setLimitFailed(false)
          }
        },
        (error) => {
          console.error('Could not check attachment limits', error)
          if (!cancelled) setLimitFailed(true)
        }
      )
    }
    check()
    window.addEventListener('online', check)
    return () => {
      cancelled = true
      window.removeEventListener('online', check)
    }
  }, [files.length, draftKey, limitAttempt])
  const lastTypingEmit = useRef(0)
  const previews = useMemo(
    () => files.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null)),
    [files]
  )
  useEffect(
    () => () => {
      previews.forEach((url) => {
        if (url) URL.revokeObjectURL(url)
      })
    },
    [previews]
  )
  useEffect(() => {
    void useDraftStore.getState().loadFiles(draftKey)
    return () => {
      flushDraftPersistence()
    }
  }, [draftKey])

  const serverId = useChannelStore((s) =>
    isDm ? null : (s.channels.find((c) => c.id === contextId)?.serverId ?? null)
  )

  const customEmojis = useEmojiStore((s) => (serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS))

  const dmBotUserId = useDmStore((s) => {
    if (!isDm) return null
    const conv = s.conversations.find((c) => c.id === contextId)
    if (!conv || conv.isGroup) return null
    const botMember = conv.members.find((m) => m.isBot)
    return botMember?.userId ?? null
  })

  const allBotCommands = useBotCommands(serverId, isDm ? null : contextId, dmBotUserId)
  const { has: hasPerm } = usePermissions(serverId)
  const canPingBroadcast =
    !isDm && !!serverId && (hasPerm(Permission.MENTION_EVERYONE) || hasPerm(Permission.ADMINISTRATOR))
  const botCommands = useMemo(
    () =>
      allBotCommands.filter((cmd) => {
        if (!cmd.requiredPermission) return true
        const flag = Permission[cmd.requiredPermission as keyof typeof Permission]
        return flag ? hasPerm(flag) : true
      }),
    [allBotCommands, hasPerm]
  )
  useEffect(() => {
    if (!value.trimStart().startsWith('/')) setTargetBot(null)
  }, [value, setTargetBot])

  const threadComposerKey = threadParentId ?? null
  useEffect(() => {
    const text = useComposerPrefillStore.getState().consumePrefill(contextId, threadComposerKey)
    if (!text) return
    setValue(text)
    setTargetBot(null)
    queueMicrotask(() => inputRef.current?.focus())
  }, [contextId, threadComposerKey, setValue, setTargetBot])

  useEffect(() => {
    if (replyTarget) inputRef.current?.focus()
  }, [replyTarget])

  const mentionMembersRef = useRef<MentionMember[]>([])
  const mentionChannelsRef = useRef<MentionChannel[]>(channels ?? [])
  useEffect(() => {
    const buildMembers = () => {
      if (isDm) {
        const conv = useDmStore.getState().conversations.find((c) => c.id === contextId)
        if (!conv) return []
        return conv.members
          .filter((m) => m.userId !== userId)
          .map((m) => ({
            userId: m.userId,
            username: m.username,
            displayName: m.displayName,
            avatarUrl: m.avatarUrl
          }))
      }
      const userRows = useMemberStore
        .getState()
        .members.filter((m) => m.userId !== userId)
        .map((m) => ({
          userId: m.userId,
          username: m.user.username,
          displayName: m.displayName ?? m.user.displayName,
          avatarUrl: m.user.avatarUrl
        }))
      if (!canPingBroadcast) {
        return userRows
      }
      const seenRole = new Set<string>()
      const roleRows: MentionMember[] = []
      for (const m of useMemberStore.getState().members) {
        for (const r of m.roles ?? []) {
          if (r.isDefault || seenRole.has(r.id)) continue
          seenRole.add(r.id)
          roleRows.push({
            userId: `__role__:${r.id}`,
            username: r.name,
            displayName: null,
            avatarUrl: null
          })
        }
      }
      roleRows.sort((a, b) => a.username.localeCompare(b.username))
      return [...userRows, ...roleRows]
    }
    const buildChannels = () => {
      if (isDm) return channels ?? []
      return useChannelStore
        .getState()
        .channels.filter((c) => c.type === 'text')
        .map((c) => ({ id: c.id, serverId: c.serverId, name: c.name }))
    }
    mentionMembersRef.current = buildMembers()
    mentionChannelsRef.current = buildChannels()
    const unsubs = [
      useMemberStore.subscribe(() => {
        mentionMembersRef.current = buildMembers()
      }),
      useChannelStore.subscribe(() => {
        mentionChannelsRef.current = buildChannels()
      }),
      ...(isDm
        ? [
            useDmStore.subscribe(() => {
              mentionMembersRef.current = buildMembers()
            })
          ]
        : [])
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [isDm, userId, channels, contextId, canPingBroadcast])
  const mentionMembers = mentionMembersRef.current
  const mentionChannels = mentionChannelsRef.current

  const editLastOwnMessage = useCallback(() => {
    if (!userId) return
    const list: Message[] = threadParentId
      ? useThreadStore.getState().messages
      : isDm
        ? useDmStore.getState().messages
        : useMessageStore.getState().messages
    const start = list.length - 1
    const stop = Math.max(0, list.length - EDIT_LOOKBACK)
    for (let i = start; i >= stop; i--) {
      const m = list[i]
      if (m.deleted) continue
      if (m.authorId !== userId) continue
      if (!m.content || !m.content.trim()) continue
      window.dispatchEvent(new CustomEvent('edit-message-intent', { detail: m.id }))
      return
    }
  }, [userId, isDm, threadParentId])

  const handleGifSelect = useCallback(
    (url: string) => {
      if (!userId) return
      void useOutboxStore
        .getState()
        .enqueue({
          userId,
          mode,
          contextId,
          threadParentId,
          content: url,
          files: []
        })
        .catch((error) => {
          console.error('Failed to queue GIF', error)
          setSizeError(t('outboxStorageFailed'))
        })
    },
    [userId, mode, contextId, threadParentId, t]
  )

  function emitTypingThrottled() {
    const now = Date.now()
    if (now - lastTypingEmit.current < 2000) return
    lastTypingEmit.current = now
    if (isDm) {
      getSocket()?.emit('dm:typing', { conversationId: contextId })
    } else {
      getSocket()?.emit('typing:start', { channelId: contextId })
    }
  }

  function emitTypingStop() {
    if (lastTypingEmit.current === 0) return
    lastTypingEmit.current = 0
    if (isDm) {
      getSocket()?.emit('dm:typing-stop', { conversationId: contextId })
    } else {
      getSocket()?.emit('typing:stop', { channelId: contextId })
    }
  }

  async function send() {
    if (!userId || savingRef.current || restoringFiles) return
    let content = value.trim()
    if (content.length > MAX_MESSAGE_LENGTH) {
      setSizeError(t('messageTooLong', { count: MAX_MESSAGE_LENGTH }))
      return
    }

    let sendTargetBotAppId: string | undefined
    if (content.startsWith('/')) {
      const parts = content.slice(1).split(/\s(.*)/)
      const cmd = parts[0]?.toLowerCase()
      const rest = parts[1]?.trim() ?? ''

      const textResult = resolveTextCommand(cmd, rest)
      if (textResult !== null) {
        content = textResult
      } else if (onCommand && cmd) {
        const handled = onCommand(cmd, rest)
        if (handled) {
          setValue('')
          setTargetBot(null)
          return
        }
      }

      if (targetBot && cmd === targetBot.commandName) {
        sendTargetBotAppId = targetBot.botAppId
      }
    }

    if (!content && !files.length) return
    savingRef.current = true
    setSaving(true)
    try {
      if (files.length) {
        let max = maxUploadMb
        if (max === null && navigator.onLine) {
          try {
            max = await api.getMaxUploadSizeMb()
            setMaxUploadMb(max)
            setLimitFailed(false)
          } catch (error) {
            console.error('Could not validate attachments before sending', error)
            setSizeError(t('attachmentLimitFailed'))
            return
          }
        }
        const invalid = max === null ? undefined : findOversizedAttachment(files, max)
        if (invalid) {
          setSizeError(t('attachmentTooLarge', { name: invalid.name, max }))
          return
        }
      }
      await useOutboxStore.getState().enqueue({
        userId,
        mode,
        contextId,
        content,
        files,
        threadParentId,
        replyToId: threadParentId ? undefined : replyTarget?.id,
        reply: threadParentId ? undefined : (replyTarget ?? undefined),
        clientMessageId: useDraftStore.getState().drafts[draftKey]?.outboxId,
        targetBotAppId: sendTargetBotAppId
      })
      useDraftStore.getState().update(draftKey, { text: '', reply: null, bot: null, fileCount: 0 })
      flushDraftPersistence()
      try {
        await useDraftStore.getState().setFiles(draftKey, [])
      } catch (error) {
        console.error('Message queued, but draft attachment cleanup failed', error)
        setSizeError(t('draftSaveFailed'))
      }
      onCancelReply()
      emitTypingStop()
      onSent?.()
    } catch (error) {
      console.error('Failed to save outgoing message on this device', error)
      setSizeError(t(error instanceof OutboxActionError ? error.message : 'outboxStorageFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function addFiles(newFiles: FileList | File[]) {
    setSizeError(null)
    const next = [...files, ...Array.from(newFiles)]
    if (next.length > 20) {
      setSizeError(t('tooManyAttachments'))
      return
    }
    const invalid = maxUploadMb === null ? undefined : findOversizedAttachment(next, maxUploadMb)
    if (invalid) {
      setSizeError(t('attachmentTooLarge', { name: invalid.name, max: maxUploadMb }))
      return
    }
    try {
      await useDraftStore.getState().setFiles(draftKey, next)
    } catch {
      setSizeError(t('draftSaveFailed'))
    }
  }

  function removeFile(index: number) {
    setSizeError(null)
    void useDraftStore
      .getState()
      .setFiles(
        draftKey,
        files.filter((_, i) => i !== index)
      )
      .catch(() => {
        setSizeError(t('draftSaveFailed'))
      })
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault()
      addFiles(imageFiles)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer?.files?.length) {
      addFiles(e.dataTransfer.files)
    }
  }

  const retryFiles = useCallback(() => {
    void useDraftStore.getState().loadFiles(draftKey)
  }, [draftKey])

  return {
    t,
    inputRef,
    retryFiles,
    value,
    files,
    draftError,
    restoringFiles,
    setValue,
    setTargetBot,
    saving,
    dragOver,
    setDragOver,
    sizeError,
    maxUploadMb,
    limitFailed,
    setLimitAttempt,
    previews,
    customEmojis,
    botCommands,
    mentionMembers,
    mentionChannels,
    editLastOwnMessage,
    handleGifSelect,
    emitTypingThrottled,
    send,
    addFiles,
    removeFile,
    handlePaste,
    handleDrop
  }
}
