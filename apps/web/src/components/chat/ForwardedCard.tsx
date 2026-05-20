import type { ForwardedFromSnapshot } from '@chat/shared'
import { ForwardIcon } from '@/components/chat/chatIcons'
import { MarkdownContent } from '@/components/MarkdownContent'
import { formatSmartTimestamp } from '@/lib/format-time'

type Props = {
  snapshot: ForwardedFromSnapshot
}

/**
 * Denormalized preview of a forwarded message. We render from the snapshot
 * fields on the forwarded message itself so it keeps working even if the
 * source was edited, deleted, or lives in a channel the viewer can't see.
 */
export function ForwardedCard({ snapshot }: Props) {
  const author = snapshot.authorName?.trim() || 'Unknown'
  const where = snapshot.channelName ? snapshot.channelName : 'direct message'
  const prefix = snapshot.channelName && !snapshot.dmId ? '#' : ''
  const hasContent = !!snapshot.content?.trim()

  return (
    <div className="mt-1 rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
        <ForwardIcon className="h-3.5 w-3.5 shrink-0 text-primary/70" strokeWidth={2.5} />
        <span className="font-medium text-gray-300">Forwarded from</span>
        <span className="font-medium text-gray-200">{author}</span>
        <span className="text-gray-500">in</span>
        <span className="font-medium text-gray-300">
          {prefix}
          {where}
        </span>
        {snapshot.createdAt && (
          <>
            <span className="text-gray-600">·</span>
            <time className="text-gray-500" dateTime={snapshot.createdAt}>
              {formatSmartTimestamp(snapshot.createdAt)}
            </time>
          </>
        )}
      </div>
      {hasContent ? (
        <div className="text-[15px] leading-relaxed text-gray-200">
          <MarkdownContent content={snapshot.content!.trim()} />
        </div>
      ) : (
        <p className="italic text-gray-500">[attachment]</p>
      )}
    </div>
  )
}
