import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'

export function MediaPreview({
  src,
  alt,
  onOpen,
  video = false,
  controls = false,
  compact = false,
  className = '',
  style
}: {
  src: string
  alt: string
  onOpen: () => void
  video?: boolean
  controls?: boolean
  compact?: boolean
  className?: string
  style?: CSSProperties
}) {
  const { t } = useTranslation('common')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ src: string; attempt: number; error: boolean } | null>(null)
  const current = loaded?.src === src && loaded.attempt === attempt ? loaded : null
  const ready = () => setLoaded({ src, attempt, error: false })
  const failed = () => setLoaded({ src, attempt, error: true })
  const media = video ? (
    <video
      key={`${src}-${attempt}`}
      src={controls ? src : `${src}#t=0.1`}
      controls={controls}
      muted={!controls}
      playsInline
      preload="metadata"
      onLoadedMetadata={ready}
      onError={failed}
      aria-label={alt}
      className="h-full w-full object-contain"
    >
      <track kind="captions" />
    </video>
  ) : (
    <img
      key={`${src}-${attempt}`}
      src={src}
      alt={alt}
      loading="lazy"
      onLoad={ready}
      onError={failed}
      className={`h-full w-full ${compact ? 'object-cover' : 'object-contain'}`}
    />
  )
  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-black/20 ${className}`}
      style={style}
      aria-busy={!current}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {controls ? (
        media
      ) : (
        <button
          type="button"
          aria-label={alt}
          disabled={current?.error}
          className="block h-full w-full"
          onClick={onOpen}
        >
          {media}
        </button>
      )}
      {!current && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
      )}
      {controls && !current?.error && (
        <button
          type="button"
          aria-label={t('expand')}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded bg-black/60 text-xl text-white"
          onClick={onOpen}
        >
          <span aria-hidden>&#x2922;</span>
        </button>
      )}
      {current?.error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center bg-surface-dark px-1 text-center text-xs text-gray-300"
        >
          <p className={compact ? 'sr-only' : 'mb-1'}>{t('previewFailed', { name: alt })}</p>
          <div className="flex flex-wrap justify-center gap-1">
            <button
              type="button"
              aria-label={t('retryPreview', { name: alt })}
              title={t('retryPreview', { name: alt })}
              className="min-h-11 min-w-11 px-2 text-primary underline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t('retry')}
            </button>
            {!compact && (
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center px-2 text-primary underline"
              >
                {t('openOriginal')}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
