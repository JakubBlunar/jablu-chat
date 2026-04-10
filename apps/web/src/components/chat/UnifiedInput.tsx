import type { Attachment, Message } from '@chat/shared'
import { Permission } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatInputBar,
  type ChatInputBarHandle,
  type MentionChannel,
  type MentionMember
} from '@/components/chat/ChatInputBar'
import { useBotCommands } from '@/components/chat/useBotCommands'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useEmojiStore, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'
import { useThreadStore } from '@/stores/thread.store'
import { usePermissions } from '@/hooks/usePermissions'
import { XSmallIcon } from '@/components/chat/chatIcons'
import { useComposerPrefillStore } from '@/stores/composer-prefill.store'

const TEXT_COMMANDS: Record<string, (rest: string) => string> = {
  shrug: (rest) => `${rest} ¯\\_(ツ)_/¯`.trim(),
  tableflip: (rest) => `${rest} (╯°□°)╯︵ ┻━┻`.trim(),
  unflip: (rest) => `${rest} ┬─┬ ノ( ゜-゜ノ)`.trim(),
  lenny: (rest) => `${rest} ( ͡° ͜ʖ ͡°)`.trim(),
  spoiler: (rest) => rest ? `||${rest}||` : '',
  me: (rest) => rest ? `*${rest}*` : '',
}

function resolveTextCommand(cmd: string, rest: string): string | null {
  const handler = TEXT_COMMANDS[cmd]
  if (!handler) return null
  return handler(rest) || null
}

type PendingFile = {
  file: File
  preview: string | null
  uploading: boolean
  uploaded?: Attachment
  error?: string
}

export function UnifiedInput({
  mode,
  contextId,
  replyTarget,
  onCancelReply,
  onSent,
  channels,
  gifEnabled,
  placeholder,
  onCommand,
  threadParentId
}: {
  mode: 'channel' | 'dm'
  contextId: string
  replyTarget: { id: string; content: string | null; authorName: string } | null
  onCancelReply: () => void
  onSent?: () => void
  channels?: MentionChannel[]
  gifEnabled?: boolean
  placeholder: string
  onCommand?: (command: string, args?: string) => boolean | void
  threadParentId?: string
}) {
  const isDm = mode === 'dm'
  const inputRef = useRef<ChatInputBarHandle>(null)
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const lastTypingEmit = useRef(0)
  const userId = useAuthStore((s) => s.user?.id)

  const serverId = useChannelStore((s) =>
    isDm ? null : s.channels.find((c) => c.id === contextId)?.serverId ?? null
  )

  const customEmojis = useEmojiStore((s) => serverId ? (s.byServer[serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS)

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
    !isDm &&
    !!serverId &&
    (hasPerm(Permission.MENTION_EVERYONE) || hasPerm(Permission.ADMINISTRATOR))
  const botCommands = useMemo(() =>
    allBotCommands.filter((cmd) => {
      if (!cmd.requiredPermission) return true
      const flag = Permission[cmd.requiredPermission as keyof typeof Permission]
      return flag ? hasPerm(flag) : true
    }),
    [allBotCommands, hasPerm]
  )
  const [targetBot, setTargetBot] = useState<{ botAppId: string; commandName: string } | null>(null)

  useEffect(() => {
    if (!value.trimStart().startsWith('/')) setTargetBot(null)
  }, [value])

  useEffect(() => {
    setValue('')
    setTargetBot(null)
    setFiles([])
  }, [contextId])

  const threadComposerKey = threadParentId ?? null
  useEffect(() => {
    const text = useComposerPrefillStore.getState().consumePrefill(contextId, threadComposerKey)
    if (!text) return
    setValue(text)
    setTargetBot(null)
    setFiles([])
    queueMicrotask(() => inputRef.current?.focus())
  }, [contextId, threadComposerKey])

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
      const userRows = useMemberStore.getState().members
        .filter((m) => m.userId !== userId)
        .map((m) => ({
          userId: m.userId,
          username: m.user.username,
          displayName: m.user.displayName,
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
      return useChannelStore.getState().channels
        .filter((c) => c.type === 'text')
        .map((c) => ({ id: c.id, serverId: c.serverId, name: c.name }))
    }
    mentionMembersRef.current = buildMembers()
    mentionChannelsRef.current = buildChannels()
    const unsubs = [
      useMemberStore.subscribe(() => { mentionMembersRef.current = buildMembers() }),
      useChannelStore.subscribe(() => { mentionChannelsRef.current = buildChannels() }),
      ...(isDm ? [useDmStore.subscribe(() => { mentionMembersRef.current = buildMembers() })] : [])
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [isDm, userId, channels, contextId, canPingBroadcast])
  const mentionMembers = mentionMembersRef.current
  const mentionChannels = mentionChannelsRef.current

  const handleGifSelect = useCallback(
    (url: string) => {
      if (isDm) {
        getSocket()?.emit('dm:send', { conversationId: contextId, content: url })
      } else {
        const payload: Record<string, unknown> = { channelId: contextId, content: url }
        if (threadParentId) payload.threadParentId = threadParentId
        getSocket()?.emit('message:send', payload, (res: { ok?: boolean; message?: Message }) => {
          if (res?.ok && res.message) {
            if (threadParentId) useThreadStore.getState().addMessage(res.message)
            else useMessageStore.getState().addMessage(res.message)
          }
        })
        return
      }
    },
    [isDm, contextId, threadParentId]
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

  async function uploadFiles(pending: PendingFile[]) {
    const results: PendingFile[] = [...pending]
    for (let i = 0; i < results.length; i++) {
      const p = results[i]
      if (p.uploaded || p.uploading) continue
      results[i] = { ...p, uploading: true }
      setFiles([...results])
      try {
        const att = await api.uploadAttachment(p.file)
        results[i] = { ...p, uploading: false, uploaded: att }
      } catch (e) {
        results[i] = { ...p, uploading: false, error: e instanceof Error ? e.message : 'Upload failed' }
      }
      setFiles([...results])
    }
    return results
  }

  async function send() {
    let content = value.trim()

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

    let finalFiles = files
    const pending = files.filter((f) => !f.uploaded && !f.error)
    if (pending.length > 0) {
      finalFiles = await uploadFiles(files)
    }

    const attachmentIds = finalFiles.filter((f) => f.uploaded).map((f) => f.uploaded!.id)

    if (!content && attachmentIds.length === 0) return

    if (isDm) {
      if (useDmStore.getState().hasNewer) {
        useDmStore.getState().clearMessages()
        await useDmStore.getState().fetchMessages(contextId)
      }
      getSocket()?.emit('dm:send', {
        conversationId: contextId,
        content: content || undefined,
        replyToId: replyTarget?.id,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        targetBotAppId: sendTargetBotAppId
      }, (res: { ok?: boolean; message?: Message }) => {
        if (res?.ok && res.message) useDmStore.getState().addMessage(res.message)
      })
    } else {
      if (!threadParentId && useMessageStore.getState().hasNewer) {
        useMessageStore.getState().clearMessages()
        await useMessageStore.getState().fetchMessages(contextId)
      }
      getSocket()?.emit('message:send', {
        channelId: contextId,
        content: content || undefined,
        replyToId: threadParentId ? undefined : replyTarget?.id,
        threadParentId,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        targetBotAppId: sendTargetBotAppId
      }, (res: { ok?: boolean; message?: Message; error?: string }) => {
        if (res?.ok && res.message) {
          if (threadParentId) {
            useThreadStore.getState().addMessage(res.message)
            window.dispatchEvent(new CustomEvent('forum-reply', { detail: res.message }))
          } else {
            useMessageStore.getState().addMessage(res.message)
          }
        } else if (res?.error) {
          setSizeError(res.error)
          setTimeout(() => setSizeError(null), 5000)
        }
      })
    }

    setValue('')
    setTargetBot(null)
    setFiles([])
    onCancelReply()
    emitTypingStop()
    onSent?.()
  }

  async function addFiles(newFiles: FileList | File[]) {
    const maxMb = await api.getMaxUploadSizeMb()
    const maxBytes = maxMb * 1024 * 1024
    const arr = Array.from(newFiles)
    const tooLarge = arr.filter((f) => f.size > maxBytes)
    if (tooLarge.length > 0) {
      setSizeError(`File too large. Max ${maxMb} MB allowed.`)
      setTimeout(() => setSizeError(null), 5000)
    }
    const valid = tooLarge.length > 0 ? arr.filter((f) => f.size <= maxBytes) : arr
    if (valid.length === 0) return
    const pending: PendingFile[] = valid.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      uploading: false
    }))
    setFiles((prev) => [...prev, ...pending])
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const next = [...prev]
      const removed = next.splice(index, 1)[0]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return next
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

  return (
    <div
      className={`relative shrink-0 border-t border-black/20 bg-surface px-4 pb-2 pt-2 ${
        dragOver ? 'ring-2 ring-inset ring-primary' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {replyTarget && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-surface-dark px-3 py-1.5 text-xs text-gray-300">
          <span className="text-gray-500">Replying to</span>
          <span className="font-semibold text-white">{replyTarget.authorName}</span>
          <span className="flex-1 truncate text-gray-400">{replyTarget.content || '[attachment]'}</span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="text-gray-500 transition hover:text-white">
            <XSmallIcon />
          </button>
        </div>
      )}

      {sizeError && <div className="mb-2 rounded bg-red-500/15 px-3 py-1.5 text-xs text-red-400">{sizeError}</div>}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.file.name}-${i}`} className="relative rounded-lg bg-surface-dark p-1 ring-1 ring-white/10">
              {f.preview ? (
                <img src={f.preview} alt={f.file.name} className="h-20 w-20 rounded object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded text-xs text-gray-400">
                  {f.file.name.split('.').pop()?.toUpperCase()}
                </div>
              )}
              {f.uploading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
                </div>
              )}
              {f.error && (
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-900/50 px-1 text-center text-[10px] text-red-300">
                  Failed
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow transition hover:bg-red-500"
              >
                <XSmallIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1">
        <div className="relative min-w-0 flex-1">
          <ChatInputBar
            ref={inputRef}
            value={value}
            onChange={setValue}
            onSend={() => void send()}
            onTyping={emitTypingThrottled}
            onFilesPicked={(fl) => addFiles(fl)}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={!contextId}
            members={mentionMembers.length > 0 ? mentionMembers : undefined}
            channels={mentionChannels}
            gifEnabled={gifEnabled}
            onGifSelect={handleGifSelect}
            onCommand={onCommand}
            botCommands={botCommands}
            onBotCommandPick={setTargetBot}
            customEmojis={customEmojis}
          />
        </div>
      </div>
    </div>
  )
}
