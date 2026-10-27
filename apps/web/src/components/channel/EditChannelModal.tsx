import { ModalFooter } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { Toggle } from '@/components/ui/Toggle'
import type { Channel } from '@chat/shared'
import { ChannelDetailsFields } from './ChannelDetailsFields'
import { ForumSettingsFields } from './ForumSettingsFields'
import { useEditChannel } from './hooks/useEditChannel'
export function EditChannelModal({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const {
    form,
    isArchived,
    setIsArchived,
    name,
    tChannels,
    tCommon,
    categories,
    forumTags,
    setForumTags,
    tagsLoading,
    newTagName,
    setNewTagName,
    newTagColor,
    setNewTagColor,
    newTagSaving,
    saving,
    error,
    confirmDelete,
    setConfirmDelete,
    deleting,
    roleOverrides,
    permissionsLoading,
    permissionsSaving,
    showPermissions,
    setShowPermissions,
    hasChanges,
    permissionsChanged,
    addRoleOverride,
    removeRoleOverride,
    handleCreateTag,
    handleUpdateTag,
    handleDeleteTag,
    handleSavePermissions,
    handleSave,
    handleDelete,
    togglePerm,
    availableRolesToAdd
  } = useEditChannel({ channel, onClose })
  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">{tChannels('channelForm.editTitle')}</h2>
      <p className="mt-1 text-sm text-gray-400">
        #{channel.name} &middot; {tChannels(`channelTypes.${channel.type}Channel`)}
      </p>

      <ChannelDetailsFields
        form={form}
        type={channel.type}
        categories={categories}
        idPrefix="edit-channel"
        originalName={channel.name}
      />

      {(channel.type === 'text' || channel.type === 'forum') && (
        <div className="mt-5 flex items-center justify-between text-sm text-gray-300">
          <span>
            {tChannels('channelForm.archive')}
            <span className="ml-1 text-xs text-gray-500">{tChannels('channelForm.archiveHint')}</span>
          </span>
          <Toggle checked={isArchived} onChange={setIsArchived} />
        </div>
      )}

      {channel.type === 'forum' && (
        <ForumSettingsFields
          form={form}
          idPrefix="edit-forum"
          sortOptions={[
            { value: 'latest_activity', labelKey: 'latestActivity' },
            { value: 'newest', labelKey: 'newest' }
          ]}
        >
          <div className="rounded-md bg-surface-darkest p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {tChannels('forum.tagsTitle')}
            </p>
            <p className="mt-1 text-xs text-gray-500">{tChannels('forum.editTagsDescription')}</p>

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
        </ForumSettingsFields>
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
            <p className="mb-3 text-xs text-gray-500">{tChannels('permissions.description')}</p>

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
                            r.perms.view ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'
                          }`}
                        >
                          {r.perms.view ? tChannels('permissions.allow') : tChannels('permissions.deny')}
                        </button>
                        {channel.type === 'text' || channel.type === 'forum' ? (
                          <button
                            type="button"
                            onClick={() => togglePerm(r.roleId, 'send')}
                            className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                              r.perms.send ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'
                            }`}
                          >
                            {r.perms.send ? tChannels('permissions.allow') : tChannels('permissions.deny')}
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="button"
                          onClick={() => void removeRoleOverride(r.roleId)}
                          className="rounded p-1 text-gray-500 transition hover:bg-red-500/10 hover:text-red-400"
                          title={tChannels('permissions.removeOverride')}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
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
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
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
                    {permissionsSaving ? tChannels('permissions.saving') : tChannels('permissions.save')}
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
