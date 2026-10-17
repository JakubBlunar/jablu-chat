import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { Button, Input } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { UserAvatar } from '@/components/UserAvatar'
import { api, ApiError, type DmConversation } from '@/lib/api'

export function GroupDmModal({
  conversations,
  currentUserId,
  onClose,
  onCreated,
  onExisting,
  addToConversation
}: {
  conversations: DmConversation[]
  currentUserId: string | undefined
  onClose: () => void
  onCreated: (conv: DmConversation) => void
  onExisting: (convId: string) => void
  addToConversation?: DmConversation
}) {
  const { t } = useTranslation('nav')
  const { t: tChat } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [results, setResults] = useState<
    { id: string; username: string; displayName: string | null; avatarUrl: string | null }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({})

  useEffect(() => {
    const q = search.trim()
    if (!q) {
      setResults([])
      setSearchError(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setSearchError(false)
      try {
        const data = await api.searchUsers(q)
        if (cancelled) return
        setResults(data)
      } catch {
        if (cancelled) return
        setResults([])
        setSearchError(true)
      }
      setLoading(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [search])

  const findExisting = useCallback(
    (userIds: string[]): string | null => {
      if (!currentUserId) return null
      const targetSet = new Set([...userIds, currentUserId])
      for (const conv of conversations) {
        const memberIds = new Set(conv.members.map((m) => m.userId))
        if (memberIds.size !== targetSet.size) continue
        if ([...targetSet].every((id) => memberIds.has(id))) return conv.id
      }
      return null
    },
    [conversations, currentUserId]
  )

  const handleCreate = async () => {
    if (selected.length === 0) return
    const existingId = addToConversation ? null : findExisting(selected)
    if (existingId) {
      onExisting(existingId)
      return
    }
    setCreating(true)
    setError('')
    try {
      const conv = addToConversation
        ? await api.addGroupDmMembers(addToConversation.id, selected)
        : selected.length === 1 ? await api.createDm(selected[0]) : await api.createGroupDm(selected, groupName.trim() || undefined)
      onCreated(conv)
    } catch (error) {
      setError(error instanceof ApiError ? error.message : tChat('groupDmCreateError'))
    }
    setCreating(false)
  }

  const toggle = (id: string) => {
    const user = results.find((item) => item.id === id)
    if (user) setSelectedUsers((previous) => ({ ...previous, [id]: user.displayName ?? user.username }))
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <ModalOverlay onClose={onClose} zIndex={addToConversation ? 'z-[120]' : 'z-50'}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">{addToConversation ? tChat('conversationAddMembers') : t('newMessage')}</h2>
        <button type="button" onClick={onClose} aria-label={tCommon('close')} className="text-gray-400 hover:text-white">
          ✕
        </button>
      </div>

        <div className="mb-3">
          <Input
            id="group-dm-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchUsersPlaceholder')}
          />
        </div>

        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {selected.map((id) => {
              return (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary"
                >
                  {selectedUsers[id] ?? id.slice(0, 8)}
                  <button type="button" onClick={() => toggle(id)} aria-label="Remove" className="hover:text-white">
                    ✕
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <SimpleBar className="max-h-40 space-y-1">
          {loading && <p className="text-xs text-gray-400">Searching…</p>}
          {searchError && !loading && <p className="text-xs text-red-400">Search failed. Try again.</p>}
          {results
            .filter((r) => r.id !== currentUserId && !selected.includes(r.id) && !addToConversation?.members.some((member) => member.userId === r.id))
            .map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={selected.length >= (addToConversation ? 10 - addToConversation.members.length : 9)}
                onClick={() => toggle(r.id)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-200 hover:bg-white/5"
              >
                <UserAvatar username={r.username} avatarUrl={r.avatarUrl} size="sm" />
                {r.displayName ?? r.username}
              </button>
            ))}
        </SimpleBar>

        {!addToConversation && selected.length > 1 && (
          <label className="mt-3 block text-xs text-gray-400">
            {tChat('conversationGroupName')}
            <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} />
          </label>
        )}
        {addToConversation && <p className="mt-3 text-xs text-amber-300">{tChat('conversationHistoryWarning')}</p>}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        <Button
          type="button"
          variant="primary"
          fullWidth
          className="mt-4"
          disabled={selected.length === 0 || creating}
          loading={creating}
          onClick={() => void handleCreate()}
        >
          {addToConversation ? tChat('conversationAddMembers') : creating
            ? 'Creating…'
            : selected.length <= 1
              ? 'Create DM'
              : `Create Group DM (${selected.length} members)`}
        </Button>
    </ModalOverlay>
  )
}
