import type { UserActivity } from '@chat/shared'
import { useTranslation } from 'react-i18next'
import { resolveMediaUrl } from '@/lib/api'

/** Small game/music activity icon (square, rounded). */
function ActivityIcon({ activity, size }: { activity: UserActivity; size: number }) {
  if (!activity.iconUrl) return null
  return (
    <img
      src={resolveMediaUrl(activity.iconUrl)}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded"
      style={{ width: size, height: size }}
    />
  )
}

/**
 * Reusable activity display. `compact` renders a single subtitle line for list
 * rows; `card` renders a richer two-line block for the profile card.
 */
export function ActivityLine({
  activity,
  variant = 'compact',
  className
}: {
  activity: UserActivity
  variant?: 'compact' | 'card'
  className?: string
}) {
  const { t } = useTranslation('common')
  const verb = activity.kind === 'music' ? t('activityListeningTo') : t('activityPlaying')

  if (variant === 'card') {
    return (
      <div className={`flex items-center gap-3 ${className ?? ''}`}>
        {activity.iconUrl ? (
          <ActivityIcon activity={activity} size={40} />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {verb} {activity.name}
          </p>
          {activity.details && (
            <p className="truncate text-xs text-gray-300">{activity.details}</p>
          )}
          {activity.state && (
            <p className="truncate text-xs text-gray-400">{activity.state}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <p className={`flex items-center gap-1.5 truncate text-xs text-gray-400 ${className ?? ''}`}>
      <ActivityIcon activity={activity} size={14} />
      <span className="truncate">
        <span className="text-gray-500">{verb} </span>
        <span className="text-gray-300">{activity.name}</span>
        {activity.kind === 'music' && activity.details ? (
          <span className="text-gray-500"> · {activity.details}</span>
        ) : null}
      </span>
    </p>
  )
}
