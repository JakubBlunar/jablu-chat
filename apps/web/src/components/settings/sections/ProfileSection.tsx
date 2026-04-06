import { useCallback, useRef, useState } from 'react'
import { UserAvatar } from '@/components/UserAvatar'
import { CameraIcon } from '@/components/settings/SettingsModal'
import { Button, Input, SectionHeading, Textarea } from '@/components/ui'
import { useAuthStore } from '@/stores/auth.store'

export function ProfileSection() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const uploadAvatar = useAuthStore((s) => s.uploadAvatar)
  const deleteAvatar = useAuthStore((s) => s.deleteAvatar)

  const [displayName, setDisplayName] = useState(user?.displayName ?? user?.username ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      try {
        await uploadAvatar(file)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to upload avatar')
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [uploadAvatar]
  )

  const handleDeleteAvatar = useCallback(async () => {
    try {
      await deleteAvatar()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar')
    }
  }, [deleteAvatar])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const data: Record<string, string> = {}
      if (displayName !== (user?.displayName ?? user?.username ?? '')) data.displayName = displayName
      if (bio !== (user?.bio ?? '')) data.bio = bio
      if (Object.keys(data).length > 0) {
        await updateProfile(data)
      }
      setSuccess('Profile updated')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="group relative">
          <UserAvatar username={user?.username ?? ''} avatarUrl={user?.avatarUrl} size="xl" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100"
            title="Change avatar"
          >
            <CameraIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
            className="absolute opacity-0 w-px h-px pointer-events-none"
            onChange={handleAvatarChange}
          />
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm font-medium text-primary transition hover:underline"
          >
            Change Avatar
          </button>
          {user?.avatarUrl && (
            <button
              type="button"
              onClick={handleDeleteAvatar}
              className="block text-sm text-gray-400 transition hover:text-red-400"
            >
              Remove Avatar
            </button>
          )}
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <SectionHeading as="label" className="mb-1 block">USERNAME</SectionHeading>
          <div className="w-full rounded-md border border-surface-darkest bg-surface-darkest/50 px-3 py-2 text-sm text-gray-500">
            {user?.username}
          </div>
        </div>
        <Input label="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={20} />
        <div>
          <Textarea
            label="Bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
          />
          <p className="mt-0.5 text-right text-xs text-gray-500">{bio.length}/190</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-emerald-400">{success}</p>}
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </div>
  )
}
