import { Label, ModalFooter, TagChip } from '@/components/ui'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { ChannelDetailsFields } from './ChannelDetailsFields'
import { ForumSettingsFields } from './ForumSettingsFields'
import { useCreateChannel, type CreateChannelModalProps } from './hooks/useCreateChannel'
export function CreateChannelModal({ open, onClose, defaultCategoryId }: CreateChannelModalProps) {
  const {
    form,
    tChannels,
    tCommon,
    categories,
    type,
    setType,
    draftTags,
    setDraftTags,
    draftTagName,
    setDraftTagName,
    draftTagColor,
    setDraftTagColor,
    busy,
    error,
    handleCancel,
    handleCreate
  } = useCreateChannel({ open, onClose, defaultCategoryId })
  if (!open) return null
  return (
    <ModalOverlay onClose={onClose}>
      <h2 className="text-xl font-semibold text-white">{tChannels('channelForm.createTitle')}</h2>
      <p className="mt-2 text-sm text-gray-400">{tChannels('channelForm.nameRules')}</p>
      <ChannelDetailsFields form={form} type={type} categories={categories} idPrefix="create-channel">
        <Label className="mt-5 block">{tChannels('channelForm.typeLabel')}</Label>
        <div className="mt-2 flex flex-col gap-2">
          {(
            [
              { value: 'text' as const, labelKey: 'text', hintKey: 'textHint' },
              { value: 'voice' as const, labelKey: 'voice', hintKey: 'voiceHint' },
              { value: 'forum' as const, labelKey: 'forum', hintKey: 'forumHint' }
            ] as const
          ).map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition ${
                type === opt.value
                  ? 'border-primary bg-primary/15'
                  : 'border-transparent bg-surface-darkest hover:bg-surface-darkest/80'
              }`}
            >
              <input
                type="radio"
                name="channel-type"
                value={opt.value}
                checked={type === opt.value}
                onChange={() => setType(opt.value)}
                className="h-4 w-4 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-white">
                  {tChannels(`channelTypes.${opt.labelKey}`)}
                </span>
                <span className="text-xs text-gray-500">{tChannels(`channelTypes.${opt.hintKey}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </ChannelDetailsFields>

      {type === 'forum' && (
        <ForumSettingsFields form={form} idPrefix="create-forum">
          <div className="rounded-md bg-surface-darkest p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {tChannels('forum.tagsOptionalTitle')}
            </p>
            <p className="mt-1 text-xs text-gray-500">{tChannels('forum.createTagsDescription')}</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <input
                type="text"
                value={draftTagName}
                onChange={(e) => setDraftTagName(e.target.value)}
                placeholder={tChannels('forum.tagName')}
                maxLength={32}
                className="min-w-0 flex-1 rounded-md border-0 bg-surface px-2.5 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary"
              />
              <input
                type="color"
                value={draftTagColor}
                onChange={(e) => setDraftTagColor(e.target.value)}
                className="h-9 w-11 rounded border-0 bg-surface p-1 ring-1 ring-white/10"
                aria-label={tChannels('forum.newTagColor')}
              />
              <button
                type="button"
                onClick={() => {
                  const name = draftTagName.trim()
                  if (!name) return
                  if (draftTags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return
                  setDraftTags((prev) => [...prev, { name, color: draftTagColor }])
                  setDraftTagName('')
                }}
                disabled={!draftTagName.trim()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-text transition hover:bg-primary-hover disabled:opacity-50"
              >
                {tCommon('add')}
              </button>
            </div>
            {draftTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {draftTags.map((tag, idx) => (
                  <TagChip
                    key={`${tag.name}-${idx}`}
                    name={tag.name}
                    color={tag.color}
                    onRemove={() => setDraftTags((prev) => prev.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>
            )}
          </div>
        </ForumSettingsFields>
      )}

      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <ModalFooter
        onCancel={handleCancel}
        onConfirm={() => void handleCreate()}
        cancelLabel={tCommon('cancel')}
        confirmLabel={tCommon('create')}
        loading={busy}
      />
    </ModalOverlay>
  )
}
