import type { ServerLayoutEntry } from '@chat/shared'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { arrayMove } from '@dnd-kit/sortable'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Input } from '@/components/ui/Input'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Select } from '@/components/ui/Select'
import { layoutEntryId, moveServer, removeFolder } from '@/lib/serverLayout'
import type { Server } from '@/stores/server.store'
import { useServerLayoutStore } from '@/stores/serverLayout.store'

export function OrganizeServersModal({
  entries,
  servers,
  onClose
}: {
  entries: ServerLayoutEntry[]
  servers: Server[]
  onClose: () => void
}) {
  const { t } = useTranslation('nav')
  const [draft, setDraft] = useState(entries)
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState(false)
  const saving = useServerLayoutStore((s) => s.isSaving)
  const folders = draft.filter((entry) => entry.type === 'folder')
  const byId = new Map(servers.map((server) => [server.id, server]))

  const orderButtons = (name: string, index: number, count: number, move: (to: number) => void) => (
    <div className="flex shrink-0 gap-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label={`${t('layoutMoveUp')}: ${name}`}
        disabled={saving || index === 0}
        onClick={() => move(index - 1)}
      >
        <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 15 6-6 6 6" />
        </svg>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label={`${t('layoutMoveDown')}: ${name}`}
        disabled={saving || index === count - 1}
        onClick={() => move(index + 1)}
      >
        <svg aria-hidden className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </Button>
    </div>
  )

  const serverRow = (serverId: string, folderId: string | null, index: number, count: number) => {
    const server = byId.get(serverId)
    if (!server) return null
    return (
      <div key={serverId} className="flex flex-wrap items-center gap-2 rounded-md bg-white/[0.03] p-2">
        <span className="min-w-0 flex-1 truncate text-sm text-white">{server.name}</span>
        {orderButtons(server.name, index, count, (to) =>
          setDraft(folderId ? moveServer(draft, serverId, folderId, to) : arrayMove(draft, index, to))
        )}
        <Select
          size="sm"
          aria-label={t('layoutMoveTo', { name: server.name })}
          disabled={saving}
          value={folderId ?? ''}
          onChange={(event) => setDraft(moveServer(draft, serverId, event.target.value || null))}
        >
          <option value="">{t('layoutUngrouped')}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  return createPortal(
    <ModalOverlay onClose={onClose} maxWidth="max-w-xl" zIndex="z-[120]">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault()
          setError(false)
          try {
            await useServerLayoutStore.getState().save(draft)
            onClose()
          } catch (error) {
            console.error('Could not save server organization', error)
            setError(true)
          }
        }}
      >
        <h2 className="text-lg font-semibold text-white">{t('organizeServers')}</h2>
        <p className="text-sm text-gray-400">{t('layoutHint')}</p>
        {error && (
          <div role="alert">
            <InlineAlert variant="error">{t('layoutSaveError')}</InlineAlert>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Input
            id="server-folder-name"
            label={t('layoutFolderName')}
            value={folderName}
            maxLength={50}
            disabled={saving}
            onChange={(event) => setFolderName(event.target.value)}
          />
          <Button
            type="button"
            disabled={saving || !folderName.trim() || folders.length >= 100 || draft.length >= 1000}
            onClick={() => {
              setDraft([
                ...draft,
                { type: 'folder', id: crypto.randomUUID(), name: folderName.trim(), collapsed: false, serverIds: [] }
              ])
              setFolderName('')
            }}
          >
            {t('layoutCreateFolder')}
          </Button>
        </div>
        <div className="space-y-2">
          {draft.map((entry, index) =>
            entry.type === 'server' ? (
              serverRow(entry.serverId, null, index, draft.length)
            ) : (
              <section key={layoutEntryId(entry)} className="space-y-2 rounded-lg border border-white/10 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={t('layoutFolderName')}
                    maxLength={50}
                    required
                    value={entry.name}
                    disabled={saving}
                    onChange={(event) =>
                      setDraft(draft.map((item) => (item === entry ? { ...item, name: event.target.value } : item)))
                    }
                  />
                  {orderButtons(entry.name, index, draft.length, (to) => setDraft(arrayMove(draft, index, to)))}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => setDraft(removeFolder(draft, entry.id))}
                  >
                    {t('layoutDeleteFolder')}
                  </Button>
                </div>
                {entry.serverIds.map((id, childIndex) => serverRow(id, entry.id, childIndex, entry.serverIds.length))}
              </section>
            )
          )}
        </div>
        <p className="text-xs text-gray-400">{t('layoutDeleteHint')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            {t('profileCancel')}
          </Button>
          <Button type="submit" loading={saving} disabled={folders.some((folder) => !folder.name.trim())}>
            {t('profileSave')}
          </Button>
        </div>
      </form>
    </ModalOverlay>,
    document.body
  )
}
