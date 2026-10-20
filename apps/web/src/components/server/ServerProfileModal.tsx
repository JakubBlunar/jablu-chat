import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { InlineAlert } from '@/components/ui/InlineAlert'
import { Input } from '@/components/ui/Input'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Textarea } from '@/components/ui/Textarea'
import { useMemberStore, type Member } from '@/stores/member.store'

export function ServerProfileModal({
  serverId,
  userId,
  onClose
}: {
  serverId: string
  userId: string
  onClose: () => void
}) {
  const { t } = useTranslation('nav')
  const member = useMemberStore((s) => s.members.find((m) => m.serverId === serverId && m.userId === userId))
  const [error, setError] = useState(false)
  const fetchMembers = useMemberStore((s) => s.fetchMembers)

  useEffect(() => {
    if (member) return
    let cancelled = false
    void fetchMembers(serverId)
      .then(() => {
        if (
          !cancelled &&
          !useMemberStore.getState().members.some((m) => m.serverId === serverId && m.userId === userId)
        ) {
          setError(true)
        }
      })
      .catch((error: unknown) => {
        console.error('Could not load server profile', error)
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [serverId, userId, member, fetchMembers])

  return (
    <ModalOverlay onClose={onClose} zIndex="z-[120]" aria-label={t('profileEdit')}>
      {member ? (
        <ServerProfileForm key={`${serverId}:${userId}`} member={member} onClose={onClose} />
      ) : (
        <>
          <h2 className="mb-4 text-lg font-semibold text-white">{t('profileEdit')}</h2>
          <p role={error ? 'alert' : 'status'}>{error ? t('profileLoadError') : t('profileLoading')}</p>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('profileCancel')}
          </Button>
        </>
      )}
    </ModalOverlay>
  )
}

function ServerProfileForm({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation('nav')
  const [displayName, setDisplayName] = useState(member.displayName ?? '')
  const [bio, setBio] = useState(member.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setSaving(true)
        setError(null)
        try {
          await useMemberStore.getState().saveServerProfile(member.serverId, member.userId, { displayName, bio })
          onClose()
        } catch (error) {
          console.error('Could not save server profile', error)
          setError(t('profileSaveError'))
        } finally {
          setSaving(false)
        }
      }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold text-white">{t('profileEdit')}</h2>
      <p className="text-sm text-gray-400">{t('profileHint', { username: member.user.username })}</p>
      {error && (
        <div role="alert">
          <InlineAlert variant="error">{error}</InlineAlert>
        </div>
      )}
      <Input
        id="server-profile-name"
        label={t('profileName')}
        maxLength={32}
        value={displayName}
        placeholder={member.user.displayName ?? member.user.username}
        onChange={(event) => setDisplayName(event.target.value)}
        disabled={saving}
      />
      <Textarea
        id="server-profile-bio"
        label={t('profileDescription')}
        maxLength={1000}
        rows={5}
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        disabled={saving}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => {
            setDisplayName('')
            setBio('')
          }}
        >
          {t('profileClear')}
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
          {t('profileCancel')}
        </Button>
        <Button type="submit" loading={saving}>
          {t('profileSave')}
        </Button>
      </div>
    </form>
  )
}
