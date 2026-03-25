import type { Attachment } from '@chat/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatInputBar,
  type ChatInputBarHandle,
  type MentionChannel,
  type MentionMember
} from '@/components/chat/ChatInputBar'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth.store'
import { useChannelStore } from '@/stores/channel.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useMessageStore } from '@/stores/message.store'

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
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
  placeholder
}: {
  mode: 'channel' | 'dm'
  contextId: string
  replyTarget: { id: string; content: string | null; authorName: string } | null
  onCancelReply: () => void
  onSent?: () => void
  channels?: MentionChannel[]
  gifEnabled?: boolean
  placeholder: string
}) {
  const isDm = mode === 'dm'
  const inputRef = useRef<ChatInputBarHandle>(null)
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<PendingFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [sizeError, setSizeError] = useState<string | null>(null)
  const lastTypingEmit = useRef(0)
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (replyTarget) inputRef.current?.focus()
  }, [replyTarget])

  const rawMembers = useMemberStore((s) => s.members)
  const mentionMembers: MentionMember[] = useMemo(
    () =>
      isDm
        ? []
        : rawMembers
            .filter((m) => m.userId !== userId)
            .map((m) => ({
              userId: m.userId,
              username: m.user.username,
              displayName: m.user.displayName,
              avatarUrl: m.user.avatarUrl
            })),
    [rawMembers, userId, isDm]
  )

  const allChannels = useChannelStore((s) => s.channels)
  const mentionChannels: MentionChannel[] = useMemo(
    () =>
      isDm
        ? (channels ?? [])
        : allChannels.filter((c) => c.type === 'text').map((c) => ({ id: c.id, serverId: c.serverId, name: c.name })),
    [allChannels, isDm, channels]
  )

  const handleGifSelect = useCallback(
    (url: string) => {
      if (isDm) {
        getSocket()?.emit('dm:send', { conversationId: contextId, content: url })
      } else {
        getSocket()?.emit('message:send', { channelId: contextId, content: url })
      }
    },
    [isDm, contextId]
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
    const content = value.trim()

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
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined
      })
    } else {
      if (useMessageStore.getState().hasNewer) {
        useMessageStore.getState().clearMessages()
        await useMessageStore.getState().fetchMessages(contextId)
      }
      getSocket()?.emit('message:send', {
        channelId: contextId,
        content: content || undefined,
        replyToId: replyTarget?.id,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined
      })
    }

    setValue('')
    setFiles([])
    onCancelReply()
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
          <button type="button" onClick={onCancelReply} className="text-gray-500 transition hover:text-white">
            <XIcon />
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
                className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-0.5 text-white shadow transition hover:bg-red-500"
              >
                <XIcon />
              </button>
            </div>
          ))}
        </div>
      )}

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
      />
    </div>
  )
}
