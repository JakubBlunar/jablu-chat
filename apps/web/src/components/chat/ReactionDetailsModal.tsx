import type { ReactionGroup } from '@chat/shared'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { UserAvatar } from '@/components/UserAvatar'
import { ReactionEmoji } from '@/components/chat/ReactionPill'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { useBackGestureClose } from '@/hooks/useBackGestureClose'
import { useIsMobile } from '@/hooks/useMobile'
import type { CustomEmoji } from '@/lib/api/types'

type Props = {
  reactions: ReactionGroup[]
  initialEmoji: string
  mode: 'channel' | 'dm'
  contextId: string
  customEmojiMap?: Map<string, CustomEmoji>
  onClose: () => void
}

type ResolvedUser = {
  userId: string
  displayName: string
  username: string
  avatarUrl: string | null
  isUnknown: boolean
}

export function ReactionDetailsModal({
  reactions,
  initialEmoji,
  mode,
  contextId,
  customEmojiMap,
  onClose
}: Props) {
  const { t } = useTranslation('chat')
  const isMobile = useIsMobile()

  useBackGestureClose(true, onClose, isMobile)

  const initial = reactions.find((r) => r.emoji === initialEmoji)?.emoji ?? reactions[0]?.emoji ?? null
  const [selected, setSelected] = useState<string | null>(initial)

  const selectedReaction = useMemo(
    () => reactions.find((r) => r.emoji === selected) ?? reactions[0] ?? null,
    [reactions, selected]
  )

  const resolveUser = useResolveReactors(mode, contextId)

  const reactorRows: ResolvedUser[] = useMemo(() => {
    if (!selectedReaction) return []
    return selectedReaction.userIds.map((id) => resolveUser(id))
  }, [selectedReaction, resolveUser])

  const body = (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-100">{t('reactionsTitle')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close', { ns: 'common', defaultValue: 'Close' })}
          className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-gray-100"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav
          className="flex w-[88px] shrink-0 flex-col gap-1 overflow-y-auto border-r border-white/5 p-2"
          aria-label={t('reactionsTitle')}
        >
          {reactions.map((r) => {
            const active = r.emoji === selectedReaction?.emoji
            return (
              <button
                key={r.emoji}
                type="button"
                onClick={() => setSelected(r.emoji)}
                aria-pressed={active}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition ${
                  active
                    ? 'bg-primary/20 text-primary ring-1 ring-primary/40'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <ReactionEmoji emoji={r.emoji} isCustom={r.isCustom} customEmojiMap={customEmojiMap} />
                <span className="font-semibold">{r.count}</span>
              </button>
            )
          })}
        </nav>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {reactorRows.map((u) => (
            <li key={u.userId} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-white/5">
              <UserAvatar username={u.username} avatarUrl={u.avatarUrl} size="md" />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-semibold ${u.isUnknown ? 'text-gray-400 italic' : 'text-gray-100'}`}>
                  {u.displayName}
                </div>
                {!u.isUnknown && (
                  <div className="truncate text-xs text-gray-400">{u.username}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} maxHeightDvh={85} bodyScrollable={false}>
        {body}
      </BottomSheet>
    )
  }

  return (
    <ModalOverlay onClose={onClose} maxWidth="max-w-2xl" noPadding dialogBodyScroll={false}>
      <div className="flex h-[min(70vh,32rem)] flex-col">{body}</div>
    </ModalOverlay>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function useResolveReactors(mode: 'channel' | 'dm', contextId: string): (userId: string) => ResolvedUser {
  const { t } = useTranslation('chat')
  const self = useAuthStore((s) => s.user)
  const members = useMemberStore((s) => s.members)
  const dmConversation = useDmStore((s) =>
    mode === 'dm' ? s.conversations.find((c) => c.id === contextId) : undefined
  )

  return useCallback(
    (userId: string): ResolvedUser => {
      if (self && userId === self.id) {
        return {
          userId,
          displayName: self.displayName ?? self.username,
          username: self.username,
          avatarUrl: self.avatarUrl ?? null,
          isUnknown: false
        }
      }
      if (mode === 'channel') {
        const m = members.find((mem) => mem.userId === userId)
        if (m) {
          return {
            userId,
            displayName: m.user.displayName ?? m.user.username,
            username: m.user.username,
            avatarUrl: m.user.avatarUrl ?? null,
            isUnknown: false
          }
        }
      } else {
        const dmMember = dmConversation?.members.find((mem) => mem.userId === userId)
        if (dmMember) {
          return {
            userId,
            displayName: dmMember.displayName ?? dmMember.username,
            username: dmMember.username,
            avatarUrl: dmMember.avatarUrl ?? null,
            isUnknown: false
          }
        }
      }
      return {
        userId,
        displayName: t('unknownUser'),
        username: userId.slice(0, 8),
        avatarUrl: null,
        isUnknown: true
      }
    },
    [self, mode, members, dmConversation, t]
  )
}
