import type { BotApplication } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, InlineAlert } from '@/components/ui'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/lib/api'

const USERNAME_PATTERN = /^[a-z0-9_-]{2,32}$/

function validateUsername(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (v.length < 2 || v.length > 32) {
    return 'Username must be 2–32 characters.'
  }
  if (!USERNAME_PATTERN.test(v)) {
    return 'Use lowercase letters, numbers, hyphens, and underscores only.'
  }
  return null
}

export function MyBotsSection() {
  const [bots, setBots] = useState<BotApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [sectionError, setSectionError] = useState<string | null>(null)
  const [newBotToken, setNewBotToken] = useState<string | null>(null)
  const [regenerated, setRegenerated] = useState<{ botId: string; token: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BotApplication | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const fetchBots = useCallback(async () => {
    setSectionError(null)
    try {
      const list = await api.listOwnBots()
      setBots(list)
    } catch {
      setSectionError('Failed to load your bots.')
      setBots([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBots()
  }, [fetchBots])

  const copyToken = useCallback((token: string, key: string) => {
    void navigator.clipboard.writeText(token)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  const handleCreate = useCallback(async () => {
    const u = username.trim().toLowerCase()
    const nameErr = validateUsername(u)
    setUsernameError(nameErr)
    if (nameErr) return
    if (!displayName.trim()) {
      setSectionError('Display name is required.')
      return
    }
    setSectionError(null)
    setCreating(true)
    try {
      const created = await api.createBot({
        username: u,
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        public: isPublic
      })
      setBots((prev) => [created, ...prev])
      setNewBotToken(created.token)
      setRegenerated(null)
      setUsername('')
      setDisplayName('')
      setDescription('')
    } catch {
      setSectionError('Could not create bot. Check the username and try again.')
    } finally {
      setCreating(false)
    }
  }, [username, displayName, description])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    setSectionError(null)
    try {
      await api.deleteBot(deleteTarget.id)
      setBots((prev) => prev.filter((b) => b.id !== deleteTarget.id))
      setDeleteTarget(null)
      setNewBotToken(null)
      if (regenerated?.botId === deleteTarget.id) setRegenerated(null)
    } catch {
      setSectionError('Failed to delete bot.')
      setDeleteTarget(null)
    }
  }, [deleteTarget, regenerated?.botId])

  const [editingBot, setEditingBot] = useState<BotApplication | null>(null)
  const [editDescription, setEditDescription] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleTogglePublic = useCallback(async (bot: BotApplication) => {
    setSectionError(null)
    try {
      const updated = await api.updateBot(bot.id, { public: !bot.public })
      setBots((prev) => prev.map((b) => (b.id === bot.id ? { ...b, public: updated.public } : b)))
    } catch {
      setSectionError('Failed to update bot visibility.')
    }
  }, [])

  const handleStartEdit = useCallback((bot: BotApplication) => {
    setEditingBot(bot)
    setEditDisplayName(bot.user.displayName?.trim() || bot.name)
    setEditDescription(bot.description ?? '')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingBot) return
    setSaving(true)
    setSectionError(null)
    try {
      const updated = await api.updateBot(editingBot.id, {
        displayName: editDisplayName.trim(),
        description: editDescription.trim()
      })
      setBots((prev) => prev.map((b) => (b.id === editingBot.id ? { ...b, ...updated } : b)))
      setEditingBot(null)
    } catch {
      setSectionError('Failed to update bot.')
    } finally {
      setSaving(false)
    }
  }, [editingBot, editDisplayName, editDescription])

  const handleRegenerate = useCallback(async (botId: string) => {
    setSectionError(null)
    setRegeneratingId(botId)
    try {
      const { token } = await api.regenerateBotToken(botId)
      setNewBotToken(null)
      setRegenerated({ botId, token })
    } catch {
      setSectionError('Failed to regenerate token.')
    } finally {
      setRegeneratingId(null)
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-gray-400">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {sectionError && <InlineAlert variant="error">{sectionError}</InlineAlert>}

      {(newBotToken || regenerated) && (
        <div
          className="relative rounded-lg border-2 border-amber-500/60 bg-amber-500/15 px-4 py-4 shadow-lg ring-1 ring-amber-400/30"
          role="alert"
        >
          <button
            type="button"
            onClick={() => {
              setNewBotToken(null)
              setRegenerated(null)
            }}
            className="absolute right-3 top-3 rounded p-1 text-amber-200 transition hover:bg-amber-500/20 hover:text-white"
            aria-label="Dismiss token notice"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
          <p className="pr-10 text-sm font-bold text-amber-100">Save this token now — you will not see it again</p>
          <p className="mt-2 text-xs text-amber-200/90">
            Anyone with this token can act as your bot. Store it securely. If you lose it, use &quot;Regenerate Token&quot; (this invalidates the old one).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="max-w-full flex-1 break-all rounded bg-black/40 px-3 py-2 font-mono text-xs text-amber-50">
              {newBotToken ?? regenerated?.token}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                void copyToken(newBotToken ?? regenerated!.token, newBotToken ? 'new' : `regen-${regenerated!.botId}`)
              }
            >
              {copiedKey === (newBotToken ? 'new' : `regen-${regenerated?.botId}`) ? 'Copied!' : 'Copy token'}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md bg-surface-dark p-4">
        <h3 className="mb-1 text-sm font-semibold text-white">Create Bot</h3>
        <p className="mb-4 text-xs text-gray-500">
          Bots use their own account. The username becomes their @handle (2–32 chars, lowercase letters, numbers, _ and -).
        </p>
        <div className="space-y-4">
          <Input
            id="bot-username"
            label="Username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value.toLowerCase())
              setUsernameError(null)
            }}
            placeholder="my-cool-bot"
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            error={usernameError ?? undefined}
          />
          <Input
            id="bot-display-name"
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="My Cool Bot"
            maxLength={80}
          />
          <Input
            id="bot-description"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this bot does"
            maxLength={500}
          />
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-surface-darkest text-primary accent-primary"
            />
            <span className="text-sm text-gray-300">Public</span>
            <span className="text-xs text-gray-500">— anyone can find and add this bot to their server</span>
          </label>
          <Button
            type="button"
            loading={creating}
            disabled={!username.trim() || !displayName.trim()}
            onClick={() => void handleCreate()}
          >
            Create bot
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Your bots</h3>
        {bots.length === 0 ? (
          <p className="text-center text-sm text-gray-500">You have not created any bots yet.</p>
        ) : (
          <ul className="space-y-2">
            {bots.map((bot) => {
              const uname = bot.user.username
              const dname = bot.user.displayName?.trim() || bot.name
              const isEditing = editingBot?.id === bot.id
              return (
                <li
                  key={bot.id}
                  className="rounded-md bg-surface-dark px-4 py-3"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input
                        id={`edit-display-${bot.id}`}
                        label="Display name"
                        value={editDisplayName}
                        onChange={(e) => setEditDisplayName(e.target.value)}
                        maxLength={80}
                      />
                      <Input
                        id={`edit-desc-${bot.id}`}
                        label="Description"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="What this bot does"
                        maxLength={500}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="xs" loading={saving} onClick={() => void handleSaveEdit()}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="xs" onClick={() => setEditingBot(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white">
                          @{uname}
                          <span className="font-normal text-gray-400"> · {dname}</span>
                          {!bot.public && (
                            <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">PRIVATE</span>
                          )}
                        </p>
                        {bot.description && (
                          <p className="mt-0.5 text-xs text-gray-400">{bot.description}</p>
                        )}
                        <p className="text-xs text-gray-500">Created {new Date(bot.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => handleStartEdit(bot)}
                          className="text-xs font-medium text-gray-400 hover:text-gray-200"
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleTogglePublic(bot)}
                          className="text-xs font-medium text-gray-400 hover:text-gray-200"
                        >
                          {bot.public ? 'Make private' : 'Make public'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          loading={regeneratingId === bot.id}
                          onClick={() => void handleRegenerate(bot.id)}
                          className="text-xs font-medium text-amber-300 hover:text-amber-200"
                        >
                          Regenerate token
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setDeleteTarget(bot)}
                          className="text-xs font-medium text-red-400 hover:text-red-300"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete bot?"
          description={`This will remove @${deleteTarget.user.username} and revoke its token. This cannot be undone.`}
          confirmLabel="Delete bot"
          cancelLabel="Cancel"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
