import { useId, useState } from 'react'
import { Permission } from '@chat/shared'
import { usePermissions } from '@/hooks/usePermissions'
import { ChannelAccessEditor } from './ChannelAccessEditor'
import { ChannelSettingsTabs } from './ChannelSettingsTabs'
import { useChannelAccess } from './hooks/useChannelAccess'
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
    hasChanges,
    handleCreateTag,
    handleUpdateTag,
    handleDeleteTag,
    handleSave,
    handleDelete
  } = useEditChannel({ channel, onClose })
  const panelId = useId()
  const [section, setSection] = useState<'details' | 'access'>('details')
  const [accessOpened, setAccessOpened] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const { has } = usePermissions(channel.serverId)
  const canManageAccess = has(Permission.MANAGE_ROLES)
  const access = useChannelAccess(channel.serverId, channel.id, accessOpened && canManageAccess)
  const busy = saving || access.saving || deleting
  const requestClose = () => {
    if (busy) return
    if (hasChanges || access.dirty) setConfirmClose(true)
    else onClose()
  }
  const saveChanges = async () => {
    if (busy) return
    setConfirmClose(false)
    if (access.dirty && !(await access.save())) {
      setSection('access')
      return
    }
    await handleSave()
  }
  return (
    <ModalOverlay
      onClose={requestClose}
      maxWidth="max-w-3xl"
      className="flex flex-col"
      noPadding
      dialogBodyScroll={false}
    >
      <div className="shrink-0 px-6 pb-4 pt-6">
        <h2 className="text-xl font-semibold text-white">{tChannels('channelForm.editTitle')}</h2>
        <p className="mt-1 text-sm text-gray-400">
          #{channel.name} &middot; {tChannels(`channelTypes.${channel.type}Channel`)}
        </p>

        {confirmClose && (
          <div className="mt-4 rounded-lg bg-surface-darkest p-4" role="alert">
            <p className="text-sm text-white">{tChannels('access.unsavedClose')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="rounded-md bg-primary px-3 py-2 text-sm text-primary-text"
              >
                {tChannels('access.keepEditing')}
              </button>
              <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-red-400">
                {tChannels('access.discardClose')}
              </button>
            </div>
          </div>
        )}
        <div className="mt-5">
          <ChannelSettingsTabs
            label={tChannels('access.settingsSections')}
            value={section}
            options={[
              { value: 'details', label: tChannels('access.details'), panelId: `${panelId}-details` },
              { value: 'access', label: tChannels('access.title'), panelId: `${panelId}-access` }
            ]}
            onChange={(value) => {
              setSection(value)
              if (value === 'access') setAccessOpened(true)
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-5">
        <fieldset
          id={`${panelId}-details`}
          role="tabpanel"
          aria-label={tChannels('access.details')}
          hidden={section !== 'details'}
          disabled={busy}
          className="min-w-0"
        >
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
        </fieldset>
        <div
          id={`${panelId}-access`}
          role="tabpanel"
          aria-label={tChannels('access.title')}
          hidden={section !== 'access'}
          className="mt-2"
        >
          <fieldset disabled={busy} className="min-w-0">
            <ChannelAccessEditor channel={{ ...channel, isArchived }} access={access} canManage={canManageAccess} />
          </fieldset>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
        {access.dirty && (
          <p className="w-full text-xs text-gray-300" role="status">
            {tChannels(channel.type === 'voice' ? 'access.impactVoice' : 'access.impact', {
              gained: access.impact.gained,
              lost: access.impact.lost,
              sending: access.impact.sending
            })}
          </p>
        )}
        <div hidden={section !== 'details'}>
          {!confirmDelete ? (
            <button
              type="button"
              disabled={busy}
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
                disabled={busy}
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
          className="!mt-0 ml-auto"
          onCancel={requestClose}
          onConfirm={() => void saveChanges()}
          cancelLabel={tCommon('cancel')}
          confirmLabel={tChannels('access.saveChanges')}
          loading={busy}
          disabled={!name || (!hasChanges && !access.dirty) || access.conflict}
        />
      </div>
    </ModalOverlay>
  )
}
