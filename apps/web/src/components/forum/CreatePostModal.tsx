import type { ForumTag } from '@chat/shared'
import { useEffect, useState } from 'react'
import { Input, Label, ModalFooter } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useForumStore } from '@/stores/forum.store'

type PendingFile = {
  file: File
  preview: string | null
  uploading: boolean
  uploadedId?: string
  error?: string
}

export function CreatePostModal({
  channelId,
  tags,
  requireTags,
  onClose
}: {
  channelId: string
  tags: ForumTag[]
  requireTags: boolean
  onClose: () => void
}) {
  const createPost = useForumStore((s) => s.createPost)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [files, setFiles] = useState<PendingFile[]>([])
  const [selectingFiles, setSelectingFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      for (const f of files) {
        if (f.preview) URL.revokeObjectURL(f.preview)
      }
    }
  }, [files])

  const toggleTag = (id: string) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : prev.length < 5 ? [...prev, id] : prev
    )
  }

  const handleCreate = async () => {
    if (selectingFiles) {
      setError('Please wait until selected files are ready.')
      return
    }
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!content.trim() && files.length === 0) {
      setError('Post content or at least one attachment is required')
      return
    }
    if (requireTags && selectedTags.length === 0) {
      setError('At least one tag is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const finalFiles = [...files]
      const pending = finalFiles.filter((f) => !f.uploadedId && !f.error)
      if (pending.length > 0) {
        for (let i = 0; i < finalFiles.length; i++) {
          if (finalFiles[i].uploadedId || finalFiles[i].error) continue
          finalFiles[i] = { ...finalFiles[i], uploading: true }
          setFiles([...finalFiles])
          try {
            const attachment = await api.uploadAttachment(finalFiles[i].file)
            finalFiles[i] = { ...finalFiles[i], uploading: false, uploadedId: attachment.id }
          } catch (uploadErr) {
            finalFiles[i] = {
              ...finalFiles[i],
              uploading: false,
              error: uploadErr instanceof Error ? uploadErr.message : 'Upload failed'
            }
          }
          setFiles([...finalFiles])
        }
      }
      if (finalFiles.some((f) => !!f.error)) {
        setError('One or more attachments failed to upload. Remove failed files or try again.')
        setBusy(false)
        return
      }
      const attachmentIds = finalFiles.filter((f) => f.uploadedId).map((f) => f.uploadedId!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
      if (!content.trim() && attachmentIds.length === 0) {
        setError('Post content or at least one successfully uploaded attachment is required')
        setBusy(false)
        return
      }
      await createPost(
        channelId,
        title.trim(),
        content.trim() || undefined,
        selectedTags.length > 0 ? selectedTags : undefined,
        attachmentIds.length > 0 ? attachmentIds : undefined
      )
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create post')
    } finally {
      setBusy(false)
    }
  }

  const addFiles = async (newFiles: FileList | File[]) => {
    setSelectingFiles(true)
    try {
      let maxMb = 50
      try {
        maxMb = await api.getMaxUploadSizeMb()
      } catch {
        // Fallback to server default if config request fails.
      }
      const maxBytes = maxMb * 1024 * 1024
      const arr = Array.from(newFiles)
      const tooLarge = arr.filter((f) => f.size > maxBytes)
      if (tooLarge.length > 0) {
        setError(`File too large. Max ${maxMb} MB allowed.`)
        return
      }
      setFiles((prev) => {
        const next: PendingFile[] = arr
          .slice(0, Math.max(0, 20 - prev.length))
          .map((file) => ({
            file,
            preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
            uploading: false
          }))
        return [...prev, ...next]
      })
    } finally {
      setSelectingFiles(false)
    }
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const copy = [...prev]
      const removed = copy.splice(idx, 1)[0]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return copy
    })
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Create Post</h2>
      <div className="mt-5">
        <Input
          id="post-title"
          label="Title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Post title"
          maxLength={200}
          autoFocus
        />
      </div>
      <div className="mt-4">
        <Label htmlFor="post-content">Content</Label>
        <textarea
          id="post-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write your post..."
          maxLength={4000}
          rows={5}
          className="mt-1.5 w-full resize-none rounded-md border-0 bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-600 focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="mt-4">
        <Label>Attachments</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="file"
            multiple
            className="block w-full max-w-xs text-xs text-gray-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-darkest file:px-3 file:py-1.5 file:text-xs file:text-gray-300 hover:file:text-white"
            onChange={(e) => {
              const picked = e.target.files
              if (picked?.length) {
                const copied = Array.from(picked)
                e.target.value = ''
                void addFiles(copied)
              }
            }}
          />
          <span className="text-xs text-gray-500">Up to 20 files</span>
        </div>
        {files.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={`${f.file.name}-${i}`} className="relative rounded-md bg-surface-darkest p-1 ring-1 ring-white/10">
                {f.preview ? (
                  <img src={f.preview} alt={f.file.name} className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded text-[10px] text-gray-400">
                    {f.file.name.split('.').pop()?.toUpperCase() || 'FILE'}
                  </div>
                )}
                {f.uploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/50">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-white" />
                  </div>
                )}
                {f.error && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-md bg-red-900/60 px-1 text-center text-[10px] text-red-200">
                    Failed
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -right-1 -top-1 rounded-full bg-red-600 p-1 text-white"
                  aria-label="Remove attachment"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {tags.length > 0 && (
        <div className="mt-4">
          <Label>Tags {requireTags && <span className="text-red-400">*</span>}</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  selectedTags.includes(tag.id)
                    ? 'bg-primary text-primary-text'
                    : 'bg-surface-darkest text-gray-400 hover:text-white'
                }`}
                style={
                  selectedTags.includes(tag.id) && tag.color
                    ? { backgroundColor: tag.color, color: '#fff' }
                    : tag.color
                      ? { borderColor: tag.color, borderWidth: 1 }
                      : undefined
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      <ModalFooter
        onCancel={onClose}
        onConfirm={() => void handleCreate()}
        cancelLabel="Cancel"
        confirmLabel="Post"
        loading={busy || selectingFiles}
      />
    </ModalOverlay>
  )
}
