import type { MessageEmbed as EmbedType } from '@chat/shared'
import { memo } from 'react'
import { MarkdownContent } from '@/components/MarkdownContent'

function colorToHex(color?: number): string | undefined {
  if (color == null) return undefined
  return `#${color.toString(16).padStart(6, '0')}`
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  } catch {
    return iso
  }
}

export const MessageEmbedCard = memo(function MessageEmbedCard({ embed }: { embed: EmbedType }) {
  const borderColor = colorToHex(embed.color) ?? 'rgb(var(--color-primary))'

  return (
    <div
      className="max-w-[520px] overflow-hidden rounded-lg bg-surface-dark"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="flex">
        <div className="min-w-0 flex-1 p-3">
          {embed.author && (
            <div className="mb-1 flex items-center gap-1.5">
              {embed.author.iconUrl && (
                <img
                  src={embed.author.iconUrl}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                  loading="lazy"
                />
              )}
              {embed.author.url ? (
                <a
                  href={embed.author.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-white hover:underline"
                >
                  {embed.author.name}
                </a>
              ) : (
                <span className="text-xs font-semibold text-white">{embed.author.name}</span>
              )}
            </div>
          )}

          {embed.title && (
            <div className="mb-1">
              {embed.url ? (
                <a
                  href={embed.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-link hover:underline"
                >
                  {embed.title}
                </a>
              ) : (
                <span className="text-sm font-bold text-white">{embed.title}</span>
              )}
            </div>
          )}

          {embed.description && (
            <div className="mb-2 text-[13px] leading-relaxed text-gray-300">
              <MarkdownContent content={embed.description} className="[&_p]:text-[13px]" />
            </div>
          )}

          {embed.fields && embed.fields.length > 0 && (
            <div className="mb-2 grid gap-y-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {embed.fields.map((f, i) => (
                <div key={i} className={f.inline ? '' : 'col-span-full'}>
                  <div className="text-xs font-bold text-gray-400">{f.name}</div>
                  <div className="text-[13px] text-gray-200">{f.value}</div>
                </div>
              ))}
            </div>
          )}

          {embed.image && (
            <div className="mt-2">
              <img
                src={embed.image.url}
                alt=""
                className="max-h-72 max-w-full rounded object-contain"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )}

          {(embed.footer || embed.timestamp) && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
              {embed.footer?.iconUrl && (
                <img
                  src={embed.footer.iconUrl}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                  loading="lazy"
                />
              )}
              {embed.footer?.text && <span>{embed.footer.text}</span>}
              {embed.footer?.text && embed.timestamp && <span>•</span>}
              {embed.timestamp && <span>{formatTimestamp(embed.timestamp)}</span>}
            </div>
          )}
        </div>

        {embed.thumbnail && (
          <div className="shrink-0 p-3 pl-0">
            <img
              src={embed.thumbnail.url}
              alt=""
              className="h-16 w-16 rounded object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  )
})
