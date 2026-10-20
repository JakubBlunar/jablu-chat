import type { Channel, ForumLayout, ForumSortOrder, ForumTag, Role } from '@chat/shared'
import { Permission, permsToBigInt, hasPermission } from '@chat/shared'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, ModalFooter } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Toggle } from '@/components/ui/Toggle'
import { api } from '@/lib/api'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { useChannelStore } from '@/stores/channel.store'
import { useForumStore } from '@/stores/forum.store'
import { useServerStore } from '@/stores/server.store'

function normalizeChannelName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

type PermOverride = {
  view: boolean
  send: boolean
}

type RoleOverride = {
  roleId: string
  roleName: string
  perms: PermOverride
  original: PermOverride | null
}

type EditableForumTag = ForumTag & {
  saving?: boolean
  deleting?: boolean
}

const VIEW_CHANNEL = Permission.VIEW_CHANNEL
const SEND_MESSAGES = Permission.SEND_MESSAGES

function parseOverridePerms(allow: string, deny: string): PermOverride {
  const a = permsToBigInt(allow)
  const d = permsToBigInt(deny)
  return {
    view: !hasPermission(d, VIEW_CHANNEL) && hasPermission(a, VIEW_CHANNEL),
    send: !hasPermission(d, SEND_MESSAGES) && hasPermission(a, SEND_MESSAGES),
  }
}

function buildOverrideBits(perms: PermOverride): { allow: bigint; deny: bigint } {
  let allow = 0n
  let deny = 0n
  if (perms.view) allow |= VIEW_CHANNEL; else deny |= VIEW_CHANNEL
  if (perms.send) allow |= SEND_MESSAGES; else deny |= SEND_MESSAGES
  return { allow, deny }
}

export function EditChannelModal({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const { t: tChannels } = useTranslation('channels')
  const { t: tCommon } = useTranslation('common')
  const currentServerId = useServerStore((s) => s.currentServerId)
  const fetchChannels = useChannelStore((s) => s.fetchChannels)
  const categories = useChannelStore((s) => s.categories)
  const currentChannelId = useChannelStore((s) => s.currentChannelId)
  const { goToServer } = useAppNavigate()

  const [rawName, setRawName] = useState(channel.name)
  const [description, setDescription] = useState(channel.description ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(channel.categoryId ?? null)
  const [isArchived, setIsArchived] = useState(channel.isArchived ?? false)
  const [defaultSortOrder, setDefaultSortOrder] = useState<ForumSortOrder>(channel.defaultSortOrder ?? 'latest_activity')
  const [defaultLayout, setDefaultLayout] = useState<ForumLayout>(channel.defaultLayout ?? 'list')
  const [postGuidelines, setPostGuidelines] = useState(channel.postGuidelines ?? '')
  const [requireTags, setRequireTags] = useState(channel.requireTags ?? false)
  const [forumTags, setForumTags] = useState<EditableForumTag[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#7c3aed')
  const [newTagSaving, setNewTagSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [roleOverrides, setRoleOverrides] = useState<RoleOverride[]>([])
  const [allRoles, setAllRoles] = useState<Role[]>([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)

  const name = normalizeChannelName(rawName)

  const nameChanged = name !== channel.name
  const descriptionChanged = description.trim() !== (channel.description ?? '')
  const categoryChanged = categoryId !== (channel.categoryId ?? null)
  const archivedChanged = isArchived !== (channel.isArchived ?? false)
  const sortChanged = channel.type === 'forum' && defaultSortOrder !== (channel.defaultSortOrder ?? 'latest_activity')
  const layoutChanged = channel.type === 'forum' && defaultLayout !== (channel.defaultLayout ?? 'list')
  const guidelinesChanged = channel.type === 'forum' && postGuidelines !== (channel.postGuidelines ?? '')
  const requireTagsChanged = channel.type === 'forum' && requireTags !== (channel.requireTags ?? false)
  const hasChanges =
    nameChanged || descriptionChanged || categoryChanged || archivedChanged || sortChanged || layoutChanged || guidelinesChanged || requireTagsChanged

  useEffect(() => {
    if (!showPermissions || !currentServerId) return
    let cancelled = false
    setPermissionsLoading(true)

    Promise.all([
      api.getRoles(currentServerId),
      api.getChannelOverrides(channel.id)
    ]).then(([roles, overrides]) => {
      if (cancelled) return
      setAllRoles(roles)
      const overrideMap = new Map(
        (overrides as Array<{ roleId: string; allow: string; deny: string }>).map(
          (o) => [o.roleId, o] as const
        )
      )
      const items: RoleOverride[] = []
      for (const [roleId, o] of overrideMap) {
        const role = roles.find((r: Role) => r.id === roleId)
        if (!role) continue
        const perms = parseOverridePerms(o.allow, o.deny)
        items.push({ roleId, roleName: role.name, perms, original: { ...perms } })
      }
      setRoleOverrides(items)
      setPermissionsLoading(false)
    }).catch(() => {
      if (!cancelled) setPermissionsLoading(false)
    })

    return () => { cancelled = true }
  }, [showPermissions, currentServerId, channel.id])

  useEffect(() => {
    if (channel.type !== 'forum') return
    let cancelled = false
    setTagsLoading(true)
    api.getForumTags(channel.id)
      .then((tags) => {
        if (cancelled) return
        setForumTags(tags)
        setTagsLoading(false)
      })
      .catch(() => {
        if (!cancelled) setTagsLoading(false)
      })
    return () => { cancelled = true }
  }, [channel.id, channel.type])

  const permissionsChanged = roleOverrides.some(
    (r) => r.original === null || r.perms.view !== r.original.view || r.perms.send !== r.original.send
  )

  const addRoleOverride = (roleId: string) => {
    const role = allRoles.find((r) => r.id === roleId)
    if (!role || roleOverrides.some((r) => r.roleId === roleId)) return
    setRoleOverrides((prev) => [
      ...prev,
      { roleId, roleName: role.name, perms: { view: true, send: true }, original: null }
    ])
  }

  const removeRoleOverride = async (roleId: string) => {
    if (!currentServerId) return
    try {
      await api.deleteChannelOverride(currentServerId, channel.id, roleId)
      setRoleOverrides((prev) => prev.filter((r) => r.roleId !== roleId))
    } catch {
      setError(tChannels('errors.removeOverrideFailed'))
    }
  }

  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim()
    if (!name) return
    setNewTagSaving(true)
    setError(null)
    try {
      const created = await api.createForumTag(channel.id, { name, color: newTagColor || undefined })
      setForumTags((prev) => [...prev, created])
      void useForumStore.getState().fetchTags(channel.id)
      setNewTagName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.createTagFailed'))
    } finally {
      setNewTagSaving(false)
    }
  }, [channel.id, newTagName, newTagColor, tChannels])

  const handleUpdateTag = useCallback(async (tagId: string, name: string, color: string | null) => {
    setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, saving: true } : t)))
    setError(null)
    try {
      const updated = await api.updateForumTag(channel.id, tagId, { name: name.trim(), color })
      setForumTags((prev) => prev.map((t) => (t.id === tagId ? updated : t)))
      void useForumStore.getState().fetchTags(channel.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.updateTagFailed'))
      setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, saving: false } : t)))
    }
  }, [channel.id, tChannels])

  const handleDeleteTag = useCallback(async (tagId: string) => {
    setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, deleting: true } : t)))
    setError(null)
    try {
      await api.deleteForumTag(channel.id, tagId)
      setForumTags((prev) => prev.filter((t) => t.id !== tagId))
      void useForumStore.getState().fetchTags(channel.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.deleteTagFailed'))
      setForumTags((prev) => prev.map((t) => (t.id === tagId ? { ...t, deleting: false } : t)))
    }
  }, [channel.id, tChannels])

  const handleSavePermissions = useCallback(async () => {
    if (!currentServerId || !permissionsChanged) return
    setPermissionsSaving(true)
    setError(null)
    try {
      for (const r of roleOverrides) {
        if (r.original === null || r.perms.view !== r.original.view || r.perms.send !== r.original.send) {
          const bits = buildOverrideBits(r.perms)
          await api.upsertChannelOverride(currentServerId, channel.id, r.roleId, bits.allow.toString(), bits.deny.toString())
        }
      }
      setRoleOverrides((prev) => prev.map((r) => ({ ...r, original: { ...r.perms } })))
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.updatePermissionsFailed'))
    } finally {
      setPermissionsSaving(false)
    }
  }, [currentServerId, channel.id, roleOverrides, permissionsChanged, tChannels])

  const handleSave = useCallback(async () => {
    if (!currentServerId || !name) return
    if (!hasChanges) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      const patch: {
        name?: string
        description?: string | null
        categoryId?: string | null
        isArchived?: boolean
        defaultSortOrder?: ForumSortOrder
        defaultLayout?: ForumLayout
        postGuidelines?: string | null
        requireTags?: boolean
      } = {}
      if (nameChanged) patch.name = name
      if (descriptionChanged) patch.description = description.trim() || null
      if (categoryChanged) patch.categoryId = categoryId
      if (archivedChanged) patch.isArchived = isArchived
      if (sortChanged) patch.defaultSortOrder = defaultSortOrder
      if (layoutChanged) patch.defaultLayout = defaultLayout
      if (guidelinesChanged) patch.postGuidelines = postGuidelines.trim() || null
      if (requireTagsChanged) patch.requireTags = requireTags
      await api.updateChannel(currentServerId, channel.id, patch)
      await fetchChannels(currentServerId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.updateChannelFailed'))
    } finally {
      setSaving(false)
    }
  }, [
    currentServerId,
    channel,
    name,
    description,
    categoryId,
    isArchived,
    defaultSortOrder,
    defaultLayout,
    postGuidelines,
    requireTags,
    nameChanged,
    descriptionChanged,
    categoryChanged,
    archivedChanged,
    sortChanged,
    layoutChanged,
    guidelinesChanged,
    requireTagsChanged,
    hasChanges,
    fetchChannels,
    onClose,
    tChannels
  ])

  const handleDelete = useCallback(async () => {
    if (!currentServerId) return
    setDeleting(true)
    setError(null)
    try {
      await api.deleteChannel(currentServerId, channel.id)
      await fetchChannels(currentServerId)
      if (currentChannelId === channel.id) {
        goToServer(currentServerId)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : tChannels('errors.deleteChannelFailed'))
      setDeleting(false)
    }
  }, [currentServerId, channel.id, currentChannelId, goToServer, fetchChannels, onClose, tChannels])

  const togglePerm = (roleId: string, perm: keyof PermOverride) => {
    setRoleOverrides((prev) =>
      prev.map((r) => (r.roleId === roleId ? { ...r, perms: { ...r.perms, [perm]: !r.perms[perm] } } : r))
    )
  }

  const availableRolesToAdd = allRoles.filter(
    (r) => !roleOverrides.some((o) => o.roleId === r.id)
  )

  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">{tChannels('channelForm.editTitle')}</h2>
        <p className="mt-1 text-sm text-gray-400">
          #{channel.name} &middot; {tChannels(`channelTypes.${channel.type}Channel`)}
        </p>

        <div className="mt-5">
          <Input
            id="edit-channel-name"
            label={tChannels('channelForm.nameLabel')}
            type="text"
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </div>
        {name && name !== channel.name ? (
          <p className="mt-1.5 text-xs text-gray-500">
            {tChannels('channelForm.willRenameTo')} <span className="text-gray-300">#{name}</span>
          </p>
        ) : null}

        {channel.type === 'text' && (
          <div className="mt-5">
            <label htmlFor="edit-channel-description" className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {tChannels('channelForm.descriptionOptional')}
            </label>
            <textarea
              id="edit-channel-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tChannels('channelForm.descriptionPlaceholder')}
              maxLength={500}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-md border-0 bg-surface-darkest px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 transition placeholder:text-gray-600 focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {categories.length > 0 && (
          <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            {tChannels('channelForm.categoryLabel')}
            <select
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="mt-1.5 w-full rounded-md border-0 bg-surface-darkest px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary"
            >
              <option value="">{tChannels('channelForm.noCategory')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </label>
        )}

        {(channel.type === 'text' || channel.type === 'forum') && (
          <div className="mt-5 flex items-center justify-between text-sm text-gray-300">
            <span>
              {tChannels('channelForm.archive')}
              <span className="ml-1 text-xs text-gray-500">
                {tChannels('channelForm.archiveHint')}
              </span>
            </span>
            <Toggle checked={isArchived} onChange={setIsArchived} />
          </div>
        )}

        {channel.type === 'forum' && (
          <div className="mt-5 space-y-4 rounded-lg border border-white/10 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {tChannels('forum.settingsTitle')}
            </p>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {tChannels('forum.defaultSort')}
              </label>
              <div className="mt-1.5 flex gap-2">
                {([
                  { id: 'latest_activity' as const, labelKey: 'latestActivity' },
                  { id: 'newest' as const, labelKey: 'newest' }
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDefaultSortOrder(opt.id)}
                    className={`rounded-md px-3 py-1.5 text-sm transition ${
                      defaultSortOrder === opt.id
                        ? 'bg-primary text-primary-text'
                        : 'bg-surface-darkest text-gray-400 hover:text-white'
                    }`}
                  >
                    {tChannels(`forum.sort.${opt.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {tChannels('forum.defaultLayout')}
              </label>
              <div className="mt-1.5 flex gap-2">
                {(['list', 'grid'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDefaultLayout(v)}
                    className={`rounded-md px-3 py-1.5 text-sm capitalize transition ${
                      defaultLayout === v
                        ? 'bg-primary text-primary-text'
                        : 'bg-surface-darkest text-gray-400 hover:text-white'
                    }`}
                  >
                    {tChannels(`forum.layout.${v}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Input
                id="edit-forum-guidelines"
                label={tChannels('forum.postGuidelines')}
                type="text"
                value={postGuidelines}
                onChange={(e) => setPostGuidelines(e.target.value)}
                maxLength={2000}
                placeholder={tChannels('forum.editGuidelinesPlaceholder')}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={requireTags}
                onChange={(e) => setRequireTags(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              {tChannels('forum.requireTags')}
            </label>

            <div className="rounded-md bg-surface-darkest p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {tChannels('forum.tagsTitle')}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {tChannels('forum.editTagsDescription')}
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={tChannels('forum.tagName')}
                  maxLength={32}
                  className="min-w-0 flex-1 rounded-md border-0 bg-surface px-2.5 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-9 w-11 rounded border-0 bg-surface p-1 ring-1 ring-white/10"
                  aria-label={tChannels('forum.newTagColor')}
                />
                <button
                  type="button"
                  onClick={() => void handleCreateTag()}
                  disabled={newTagSaving || !newTagName.trim()}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
                >
                  {newTagSaving ? tChannels('forum.addingTag') : tCommon('add')}
                </button>
              </div>

              {tagsLoading ? (
                <div className="mt-3 text-xs text-gray-500">{tChannels('forum.loadingTags')}</div>
              ) : forumTags.length === 0 ? (
                <div className="mt-3 text-xs text-gray-500">{tChannels('forum.emptyTags')}</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {forumTags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tag.name}
                        onChange={(e) => {
                          const value = e.target.value
                          setForumTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, name: value } : t)))
                        }}
                        maxLength={32}
                        className="min-w-0 flex-1 rounded-md border-0 bg-surface px-2 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
                      />
                      <input
                        type="color"
                        value={tag.color ?? '#7c3aed'}
                        onChange={(e) => {
                          const value = e.target.value
                          setForumTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, color: value } : t)))
                        }}
                        className="h-8 w-10 rounded border-0 bg-surface p-1 ring-1 ring-white/10"
                        aria-label={tChannels('forum.colorForTag', { tagName: tag.name })}
                      />
                      <button
                        type="button"
                        onClick={() => void handleUpdateTag(tag.id, tag.name, tag.color ?? null)}
                        disabled={tag.saving || !tag.name.trim()}
                        className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs text-gray-200 transition hover:bg-white/15 disabled:opacity-50"
                      >
                        {tag.saving ? tCommon('saving') : tCommon('save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTag(tag.id)}
                        disabled={tag.deleting}
                        className="rounded-md px-2.5 py-1.5 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {tag.deleting ? tCommon('deleting') : tCommon('delete')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowPermissions((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400 transition hover:text-gray-300"
          >
            <span>{tChannels('permissions.title')}</span>
            <svg
              className={`h-4 w-4 transition-transform ${showPermissions ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showPermissions && (
            <div className="mt-3 rounded-lg bg-surface-darkest p-3">
              <p className="mb-3 text-xs text-gray-500">
                {tChannels('permissions.description')}
              </p>

              {permissionsLoading ? (
                <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
                  <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-primary" />
                  {tChannels('permissions.loadingRoles')}
                </div>
              ) : (
                <>
                  {roleOverrides.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500">{tChannels('permissions.empty')}</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_60px_60px_32px] items-center gap-1 px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        <span>{tChannels('permissions.role')}</span>
                        <span className="text-center">{tChannels('permissions.view')}</span>
                        {(channel.type === 'text' || channel.type === 'forum') && (
                          <span className="text-center">{tChannels('permissions.send')}</span>
                        )}
                        {channel.type !== 'text' && channel.type !== 'forum' && <span />}
                        <span />
                      </div>
                      {roleOverrides.map((r) => (
                        <div
                          key={r.roleId}
                          className="grid grid-cols-[1fr_60px_60px_32px] items-center gap-1 rounded-md px-1 py-1.5 transition hover:bg-white/[0.03]"
                        >
                          <span className="truncate text-sm text-gray-300">{r.roleName}</span>
                          <button
                            type="button"
                            onClick={() => togglePerm(r.roleId, 'view')}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                              r.perms.view
                                ? 'bg-emerald-600/20 text-emerald-400'
                                : 'bg-red-600/20 text-red-400'
                            }`}
                          >
                            {r.perms.view ? tChannels('permissions.allow') : tChannels('permissions.deny')}
                          </button>
                          {(channel.type === 'text' || channel.type === 'forum') ? (
                            <button
                              type="button"
                              onClick={() => togglePerm(r.roleId, 'send')}
                              className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                                r.perms.send
                                  ? 'bg-emerald-600/20 text-emerald-400'
                                  : 'bg-red-600/20 text-red-400'
                              }`}
                            >
                              {r.perms.send ? tChannels('permissions.allow') : tChannels('permissions.deny')}
                            </button>
                          ) : <span />}
                          <button
                            type="button"
                            onClick={() => void removeRoleOverride(r.roleId)}
                            className="rounded p-1 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400"
                            title={tChannels('permissions.removeOverride')}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {availableRolesToAdd.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) addRoleOverride(e.target.value)
                          e.target.value = ''
                        }}
                        className="min-w-0 flex-1 rounded-md bg-surface px-2 py-1.5 text-xs text-white outline-none ring-1 ring-white/10"
                      >
                        <option value="">{tChannels('permissions.addRoleOverride')}</option>
                        {availableRolesToAdd.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {permissionsChanged && (
                    <button
                      type="button"
                      onClick={() => void handleSavePermissions()}
                      disabled={permissionsSaving}
                      className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
                    >
                      {permissionsSaving
                        ? tChannels('permissions.saving')
                        : tChannels('permissions.save')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-between">
          <div>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
              >
                {tChannels('channelForm.delete')}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {deleting ? tCommon('deleting') : tChannels('channelForm.confirmDelete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-3 py-2 text-sm text-gray-400 hover:text-white"
                >
                  {tCommon('cancel')}
                </button>
              </div>
            )}
          </div>

          <ModalFooter
            className="!mt-0"
            onCancel={onClose}
            onConfirm={() => void handleSave()}
            cancelLabel={tCommon('cancel')}
            confirmLabel={tCommon('save')}
            loading={saving}
            disabled={!name || !hasChanges}
          />
        </div>
    </ModalOverlay>
  )
}
