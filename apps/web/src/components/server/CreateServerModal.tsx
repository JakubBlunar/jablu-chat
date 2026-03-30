import { useState } from 'react'
import { Input, ModalFooter } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useServerStore } from '@/stores/server.store'

type CreateServerModalProps = {
  open: boolean
  onClose: () => void
}

export function CreateServerModal({ open, onClose }: CreateServerModalProps) {
  const createServer = useServerStore((s) => s.createServer)
  const { orchestratedGoToChannel } = useAppNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a server name.')
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
      setError(e instanceof Error ? e.message : 'Could not create server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">Create a Server</h2>
        <p className="mt-2 text-sm text-gray-400">Give your new server a name. You can change it later.</p>
        <div className="mt-5">
          <Input
            id="create-server-name"
            label="Server name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My cool server"
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
          cancelLabel="Cancel"
          confirmLabel="Create"
          loading={busy}
        />
    </ModalOverlay>
  )
}
