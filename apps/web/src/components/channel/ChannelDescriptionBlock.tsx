import { memo } from 'react'
import { useTranslation } from 'react-i18next'

interface ChannelDescriptionBlockProps {
  channelName: string
  description?: string | null
  className?: string
}

export const ChannelDescriptionBlock = memo(function ChannelDescriptionBlock({
  channelName,
  description,
  className
}: ChannelDescriptionBlockProps) {
  const { t } = useTranslation('common')
  const text = description?.trim()

  return (
    <div className={className}>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        {t('channelInfoAbout', { name: channelName })}
      </h3>
      {text ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-200">{text}</p>
      ) : (
        <p className="text-sm italic text-gray-500">{t('channelNoDescription')}</p>
      )}
    </div>
  )
})
