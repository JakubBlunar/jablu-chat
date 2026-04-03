import type { Poll } from '@chat/shared'
import { useCallback, useMemo } from 'react'
import { getSocket } from '@/lib/socket'
import { CheckIcon, PollIcon } from '@/components/chat/chatIcons'

export function PollDisplay({ poll }: { poll: Poll }) {
  const totalVotes = useMemo(
    () => poll.options.reduce((sum, o) => sum + o.voteCount, 0),
    [poll.options]
  )

  const expired = poll.expiresAt ? new Date(poll.expiresAt) < new Date() : false

  const handleVote = useCallback(
    (optionId: string) => {
      if (expired) return
      getSocket()?.emit('poll:vote', { pollId: poll.id, optionId })
    },
    [poll.id, expired]
  )

  return (
    <div className="mt-2 max-w-md rounded-lg border border-white/10 bg-surface-dark p-3">
      <div className="mb-2 flex items-start gap-2">
        <PollIcon />
        <h4 className="text-sm font-semibold text-white">{poll.question}</h4>
      </div>

      {poll.multiSelect && (
        <p className="mb-2 text-[11px] text-gray-500">Select multiple options</p>
      )}

      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0
          return (
            <button
              key={opt.id}
              type="button"
              disabled={expired}
              onClick={() => handleVote(opt.id)}
              className={`group relative flex w-full items-center overflow-hidden rounded-md border px-3 py-2 text-left text-sm transition ${
                opt.voted
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              } ${expired ? 'cursor-default' : ''}`}
            >
              <div
                className={`absolute inset-y-0 left-0 transition-all ${opt.voted ? 'bg-primary/20' : 'bg-white/5'}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex-1 truncate text-gray-200">{opt.label}</span>
              <span className="relative ml-2 shrink-0 text-xs font-medium text-gray-400">
                {pct}%
              </span>
              {opt.voted && (
                <CheckIcon />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
        <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
        {expired && <span className="text-yellow-500/70">Poll ended</span>}
        {poll.expiresAt && !expired && (
          <span>Ends {new Date(poll.expiresAt).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  )
}
