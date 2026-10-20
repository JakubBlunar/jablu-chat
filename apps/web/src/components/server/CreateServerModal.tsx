import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, ModalFooter } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useServerStore } from '@/stores/server.store'

type CreateServerModalProps = {
  open: boolean
  onClose: () => void
}

export function CreateServerModal({ open, onClose }: CreateServerModalProps) {
  const { t } = useTranslation('server')
  const createServer = useServerStore((s) => s.createServer)
  const { orchestratedGoToChannel } = useAppNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t('createServer.nameRequired'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const server = await createServer(trimmed)
      void orchestratedGoToChannel(server.id)
      setName('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('createServer.createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">{t('createServer.title')}</h2>
        <p className="mt-2 text-sm text-gray-400">{t('createServer.description')}</p>
        <div className="mt-5">
          <Input
            id="create-server-name"
            label={t('createServer.nameLabel')}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('createServer.namePlaceholder')}
            maxLength={100}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <ModalFooter
          onCancel={() => {
            setName('')
            setError(null)
            onClose()
          }}
          onConfirm={() => void handleCreate()}
          cancelLabel={t('actions.cancel')}
          confirmLabel={t('actions.create')}
          loading={busy}
        />
    </ModalOverlay>
  )
}
