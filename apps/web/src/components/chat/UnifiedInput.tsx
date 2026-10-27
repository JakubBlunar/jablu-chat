import { XSmallIcon } from '@/components/chat/chatIcons'
import { ChatInputBar } from '@/components/chat/ChatInputBar'
import { formatBytes } from '@/lib/format-bytes'
import type { MessageComposerProps } from './composerTypes'
import { useMessageComposer } from './hooks/useMessageComposer'
import { OutboxMessages } from './OutboxMessages'
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
}: MessageComposerProps) {
  const {
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
  } = useMessageComposer({
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
  })
  return (
    <div
      data-message-composer
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
      <OutboxMessages mode={mode} contextId={contextId} threadParentId={threadParentId} />
      {draftError && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {t('draftSaveFailed')}
        </p>
      )}
      {restoringFiles && (
        <button type="button" className="mb-2 min-h-11 text-sm text-primary" onClick={retryFiles}>
          {t('restoreAttachments')}
        </button>
      )}
      {replyTarget && (
        <div className="mb-1 flex items-center gap-2 rounded-t-lg bg-surface-dark px-3 py-1.5 text-xs text-gray-300">
          <span className="text-gray-500">{t('replyingTo')}</span>
          <span className="font-semibold text-white">{replyTarget.authorName || t('unknownUser')}</span>
          <span className="flex-1 truncate text-gray-400">{replyTarget.content || t('conversationAttachment')}</span>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label={t('cancelReply')}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-500 transition hover:text-white"
          >
            <XSmallIcon />
          </button>
        </div>
      )}

      {sizeError && <div className="mb-2 rounded bg-red-500/15 px-3 py-1.5 text-xs text-red-400">{sizeError}</div>}

      {files.length > 0 && (
        <p className="mb-2 text-xs text-gray-400">
          {maxUploadMb !== null ? t('attachmentLimit', { max: maxUploadMb }) : t('attachmentLimitPending')}
          {limitFailed && (
            <button
              type="button"
              className="ml-2 min-h-11 text-primary"
              onClick={() => setLimitAttempt((attempt) => attempt + 1)}
            >
              {t('attachmentCheckAgain')}
            </button>
          )}
        </p>
      )}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="relative w-32 rounded-lg bg-surface-dark p-1 ring-1 ring-white/10"
            >
              {previews[i] ? (
                <img src={previews[i]} alt={file.name} className="h-20 w-20 rounded object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded text-xs text-gray-400">
                  {file.name.split('.').pop()?.toUpperCase()}
                </div>
              )}
              <p className="mt-1 truncate text-xs text-gray-200" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-gray-400">{formatBytes(file.size)}</p>
              {maxUploadMb !== null && file.size > maxUploadMb * 1024 * 1024 && (
                <p role="alert" className="text-xs text-red-400">
                  {t('attachmentTooLarge', { name: file.name, max: maxUploadMb })}
                </p>
              )}
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={t('removeAttachment', { name: file.name })}
                className="absolute -right-1.5 -top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow transition hover:bg-red-500"
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
            disabled={!contextId || saving || restoringFiles}
            hasAttachments={files.length > 0}
            members={mentionMembers.length > 0 ? mentionMembers : undefined}
            channels={mentionChannels}
            gifEnabled={gifEnabled}
            onGifSelect={handleGifSelect}
            onCommand={onCommand}
            botCommands={botCommands}
            onBotCommandPick={setTargetBot}
            customEmojis={customEmojis}
            onEditLastMessage={editLastOwnMessage}
          />
        </div>
      </div>
    </div>
  )
}
