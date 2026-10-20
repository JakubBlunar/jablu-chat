import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useServerStore } from '@/stores/server.store'

interface JoinInviteModalProps {
  onClose: () => void
}

export function JoinInviteModal({ onClose }: JoinInviteModalProps) {
  const { t } = useTranslation('server')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetchServers = useServerStore((s) => s.fetchServers)

  async function handleJoin() {
    let trimmed = code.trim()
    if (!trimmed) return
    // Extract code from a full URL like https://host/invite/my-code
    const urlMatch = trimmed.match(/\/invite\/([a-z0-9-]+)\/?$/i)
    if (urlMatch) trimmed = urlMatch[1]

    setLoading(true)
    setError(null)
    try {
      // Try vanity first, fall back to regular invite
      try {
        await api.joinViaVanity(trimmed)
      } catch {
        await api.joinViaInvite(trimmed)
      }
      await fetchServers()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('join.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-sm">
      <h2 className="mb-1 text-lg font-bold text-white">{t('join.title')}</h2>
      <p className="mb-4 text-sm text-gray-400">{t('join.description')}</p>

      <div className="mb-3">
        <Input
          id="join-invite-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('join.placeholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleJoin()
          }}
          autoFocus
        />
      </div>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button
          variant="primary"
          type="button"
          disabled={loading || !code.trim()}
          loading={loading}
          onClick={() => void handleJoin()}
        >
          {loading ? t('join.joining') : t('join.join')}
        </Button>
      </div>
    </ModalOverlay>
  )
}
