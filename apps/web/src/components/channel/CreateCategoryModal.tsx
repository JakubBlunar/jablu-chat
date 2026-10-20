import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

export function CreateCategoryModal({ onClose }: { onClose: () => void }) {
  const { t: tChannels } = useTranslation('channels')
  const { t: tCommon } = useTranslation('common')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const addCategory = useChannelStore((s) => s.addCategory)

  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!currentServerId) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError(tChannels('errors.categoryNameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await api.createCategory(currentServerId, trimmed)
      addCategory(created)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.createCategoryFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">{tChannels('category.createTitle')}</h2>
      <div className="mt-4">
        <Input
          id="create-category-name"
          label={tChannels('category.nameLabel')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tChannels('category.namePlaceholder')}
          maxLength={100}
          autoFocus
        />
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {tCommon('cancel')}
        </Button>
        <Button onClick={() => void handleCreate()} disabled={busy || !name.trim()} loading={busy}>
          {busy ? tCommon('creating') : tCommon('create')}
        </Button>
      </div>
    </ModalOverlay>
  )
}
