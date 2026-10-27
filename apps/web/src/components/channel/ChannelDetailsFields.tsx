import type { ChannelCategory, ChannelType } from '@chat/shared'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import type { ChannelDraft } from './hooks/useChannelDraft'

export function ChannelDetailsFields({
  form,
  type,
  categories,
  idPrefix,
  originalName,
  children
}: {
  form: ChannelDraft
  type: ChannelType
  categories: Pick<ChannelCategory, 'id' | 'name'>[]
  idPrefix: string
  originalName?: string
  children?: ReactNode
}) {
  const { t } = useTranslation('channels')
  return (
    <>
      <div className="mt-5">
        <Input
          id={idPrefix + '-name'}
          label={t('channelForm.nameLabel')}
          type="text"
          value={form.rawName}
          onChange={(e) => form.setRawName(e.target.value)}
          placeholder={t('channelForm.namePlaceholder')}
          maxLength={100}
          autoFocus
        />
      </div>
      {form.name && (!originalName || form.name !== originalName) ? (
        <p className="mt-1.5 text-xs text-gray-500">
          {t(originalName ? 'channelForm.willRenameTo' : 'channelForm.willCreateAs')}{' '}
          <span className="text-gray-300">#{form.name}</span>
        </p>
      ) : null}
      {type === 'text' && (
        <div className="mt-5">
          <Textarea
            id={idPrefix + '-description'}
            label={t('channelForm.descriptionOptional')}
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            placeholder={t('channelForm.descriptionPlaceholder')}
            maxLength={500}
            rows={2}
          />
        </div>
      )}
      {children}
      {categories.length > 0 && (
        <div className="mt-5">
          <Select
            id={idPrefix + '-category'}
            label={t('channelForm.categoryLabel')}
            value={form.categoryId ?? ''}
            onChange={(e) => form.setCategoryId(e.target.value || null)}
          >
            <option value="">{t('channelForm.noCategory')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </>
  )
}
