import type { ForumSortOrder } from '@chat/shared'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/Label'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Textarea } from '@/components/ui/Textarea'
import type { ChannelDraft } from './hooks/useChannelDraft'

function OptionButtons<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="mt-1.5 flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            'rounded-md px-3 py-1.5 text-sm capitalize transition ' +
            (value === option.value
              ? 'bg-primary text-primary-text'
              : 'bg-surface-darkest text-gray-400 hover:text-white')
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function ForumSettingsFields({
  form,
  idPrefix,
  sortOptions,
  children
}: {
  form: ChannelDraft
  idPrefix: string
  sortOptions?: { value: ForumSortOrder; labelKey: string }[]
  children?: ReactNode
}) {
  const { t } = useTranslation('channels')
  return (
    <div className="mt-5 space-y-4 rounded-lg border border-white/10 p-3">
      <SectionHeading>{t('forum.settingsTitle')}</SectionHeading>
      {sortOptions && (
        <div>
          <Label>{t('forum.defaultSort')}</Label>
          <OptionButtons
            value={form.defaultSortOrder}
            onChange={form.setDefaultSortOrder}
            options={sortOptions.map((option) => ({ value: option.value, label: t('forum.sort.' + option.labelKey) }))}
          />
        </div>
      )}
      <div>
        <Label>{t('forum.defaultLayout')}</Label>
        <OptionButtons
          value={form.defaultLayout}
          onChange={form.setDefaultLayout}
          options={(['list', 'grid'] as const).map((value) => ({ value, label: t('forum.layout.' + value) }))}
        />
      </div>
      <Textarea
        id={idPrefix + '-guidelines'}
        label={t('forum.postGuidelines')}
        value={form.postGuidelines}
        onChange={(e) => form.setPostGuidelines(e.target.value)}
        maxLength={2000}
        rows={2}
        placeholder={t('forum.' + (sortOptions ? 'editGuidelinesPlaceholder' : 'createGuidelinesPlaceholder'))}
      />
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={form.requireTags}
          onChange={(e) => form.setRequireTags(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        {t('forum.requireTags')}
      </label>
      {children}
    </div>
  )
}
