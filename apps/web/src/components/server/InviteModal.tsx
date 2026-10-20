import type { Invite } from '@chat/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { Button, InlineAlert } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { getAppIntlLocale } from '@/lib/format-time'

interface InviteModalProps {
  serverId: string
  serverName: string
  vanityCode?: string | null
  onClose: () => void
  /** When opened above another overlay (e.g. channel bottom sheet). */
  overlayZIndex?: string
}

export function InviteModal({ serverId, serverName, vanityCode, onClose, overlayZIndex }: InviteModalProps) {
  const { t } = useTranslation('server')
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [maxUses, setMaxUses] = useState<string>('')
  const [expiresIn, setExpiresIn] = useState<string>('1440')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [vanityCopied, setVanityCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInvites = useCallback(async () => {
    setError(null)
    try {
      const data = await api.getInvites(serverId)
      setInvites(data)
    } catch {
      setError(t('invite.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [serverId, t])

  useEffect(() => {
    void fetchInvites()
  }, [fetchInvites])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const invite = await api.createInvite(serverId, {
        maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
        expiresInMinutes: expiresIn ? parseInt(expiresIn, 10) : undefined
      })
      setInvites((prev) => [invite, ...prev])
    } catch {
      setError(t('invite.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await api.deleteInvite(id)
      setInvites((prev) => prev.filter((i) => i.id !== id))
    } catch {
      setError(t('invite.deleteFailed'))
    }
  }

  function copyCode(code: string, id: string) {
    void navigator.clipboard.writeText(code)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-lg" zIndex={overlayZIndex ?? 'z-50'}>
      <div ref={dialogRef} tabIndex={-1} className="outline-none" aria-label={t('invite.title', { serverName })}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">{t('invite.title', { serverName })}</h2>
          <button type="button" onClick={onClose} aria-label={t('actions.close')} className="text-gray-400 transition hover:text-white">
            <XIcon />
          </button>
        </div>

        {vanityCode && (
          <div className="mb-4 rounded-lg bg-primary/10 px-3 py-2.5">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary">{t('invite.vanityUrl')}</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate text-sm font-medium text-white">
                {window.location.origin}/invite/{vanityCode}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/invite/${vanityCode}`)
                  setVanityCopied(true)
                  setTimeout(() => setVanityCopied(false), 2000)
                }}
                className="rounded bg-primary/20 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/30"
              >
                {vanityCopied ? t('actions.copied') : t('actions.copy')}
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            className="rounded bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none"
          >
            <option value="">{t('invite.neverExpires')}</option>
            <option value="30">{t('invite.30Minutes')}</option>
            <option value="60">{t('invite.1Hour')}</option>
            <option value="360">{t('invite.6Hours')}</option>
            <option value="720">{t('invite.12Hours')}</option>
            <option value="1440">{t('invite.24Hours')}</option>
            <option value="10080">{t('invite.7Days')}</option>
          </select>
          <select
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="rounded bg-surface-darkest px-3 py-2 text-sm text-gray-200 outline-none"
          >
            <option value="">{t('invite.noUseLimit')}</option>
            <option value="1">{t('invite.1Use')}</option>
            <option value="5">{t('invite.5Uses')}</option>
            <option value="10">{t('invite.10Uses')}</option>
            <option value="25">{t('invite.25Uses')}</option>
            <option value="50">{t('invite.50Uses')}</option>
            <option value="100">{t('invite.100Uses')}</option>
          </select>
          <Button
            type="button"
            variant="primary"
            disabled={creating}
            loading={creating}
            onClick={() => void handleCreate()}
          >
            {creating ? t('actions.creating') : t('actions.generate')}
          </Button>
        </div>

        {error && (
          <InlineAlert variant="error" className="mb-3">{error}</InlineAlert>
        )}

        <SimpleBar className="max-h-64 space-y-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-gray-400">{t('actions.loading')}</p>
          ) : invites.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">{t('invite.noInvites')}</p>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 rounded bg-surface-darkest px-3 py-2">
                <code className="flex-1 truncate text-sm font-medium text-white">{inv.code}</code>
                <span className="text-xs text-gray-400">
                  {inv.useCount}
                  {inv.maxUses != null ? `/${inv.maxUses}` : ''} {t('invite.uses')}
                  {inv.expiresAt ? <> &middot; {t('invite.expiresOn', { date: new Date(inv.expiresAt).toLocaleDateString(getAppIntlLocale()) })}</> : null}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(inv.code, inv.id)}
                  className="rounded bg-primary/20 px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/30"
                >
                  {copiedId === inv.id ? t('actions.copied') : t('actions.copy')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(inv.id)}
                  aria-label={t('invite.delete')}
                  title={t('invite.delete')}
                  className="text-gray-500 transition hover:text-red-400"
                >
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
        </SimpleBar>
      </div>
    </ModalOverlay>
  )
}

function XIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
