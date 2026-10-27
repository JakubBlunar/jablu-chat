import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth.store'
import { useDmStore } from '@/stores/dm.store'
import { useMemberStore } from '@/stores/member.store'
import { resolveReactorIdentity } from '@/lib/reactorIdentity'

export function useReactorIdentityResolver(mode: 'channel' | 'dm', contextId: string) {
  const { t } = useTranslation('chat')
  const self = useAuthStore((state) => state.user)
  const members = useMemberStore((state) => state.members)
  const conversation = useDmStore((state) =>
    mode === 'dm' ? state.conversations.find((value) => value.id === contextId) : undefined
  )
  return useCallback(
    (userId: string) =>
      resolveReactorIdentity(userId, {
        self,
        members,
        dmMembers: conversation?.members,
        mode,
        unknownLabel: t('unknownUser')
      }),
    [self, members, conversation, mode, t]
  )
}
