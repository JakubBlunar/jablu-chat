import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { api, type DmConversation } from '@/lib/api'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { PinnedMessagesList } from '@/components/chat/PinnedMessagesList'
import type { usePinnedMessages } from '@/components/chat/hooks/usePinnedMessages'
import { AttachmentBrowser } from '@/components/media/AttachmentBrowser'
import { useIsMobile } from '@/hooks/useMobile'
import { DmProfilePanel } from './DmProfilePanel'
import { ConversationActions } from './ConversationActions'
import { GroupConversationDetails } from './GroupConversationDetails'

type Tab = 'details' | 'media' | 'files' | 'pins'

export function ConversationInfoPanel({
  conversation,
  currentUserId,
  otherMember,
  mutualServers,
  initialTab = 'details',
  pinned,
  onClose,
  onSearch,
  onJump
}: {
  conversation: DmConversation
  currentUserId?: string
  otherMember: DmConversation['members'][number] | null
  mutualServers: Parameters<typeof DmProfilePanel>[0]['mutualServers']
  initialTab?: Tab
  pinned: ReturnType<typeof usePinnedMessages>
  onClose: () => void
  onSearch: () => void
  onJump: (messageId: string) => void
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const isMobile = useIsMobile()
  const [tab, setTab] = useState<Tab>(initialTab)
  const loadPage = useCallback((page: number, limit: number) =>
    api.getDmAttachments(conversation.id, tab === 'files' ? 'files' : 'media', page, limit), [conversation.id, tab])

  useEffect(() => {
    if (tab === 'pins') void pinned.loadPinned()
  }, [tab, pinned.loadPinned])

  useEffect(() => {
    if (isMobile) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isMobile, onClose])

  const jump = (messageId: string) => { onClose(); onJump(messageId) }
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <h2 className="truncate font-semibold text-white">{t('conversationInfo')}</h2>
        <button type="button" aria-label={tCommon('close')} onClick={onClose} className="rounded p-2 text-gray-400 hover:bg-white/10">&times;</button>
      </div>
      <div className="shrink-0 px-3 py-2">
        <button type="button" onClick={() => { onClose(); onSearch() }} className="text-sm text-primary">{t('channelInfoActionSearch')}</button>
      </div>
      <ConversationActions conversation={conversation} onClose={onClose} />
      <div role="tablist" aria-label={t('conversationInfo')} className="flex shrink-0 overflow-x-auto border-b border-white/10 px-1">
        {(['details', 'media', 'files', 'pins'] as const).map((id) => (
          <button key={id} id={`conversation-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls="conversation-tabpanel" type="button" onClick={() => setTab(id)}
            className={`flex-1 whitespace-nowrap border-b-2 px-2 py-3 text-sm ${tab === id ? 'border-primary text-primary' : 'border-transparent text-gray-400 hover:text-white'}`}>
            {t(id === 'details' ? conversation.isGroup ? 'channelInfoTabMembers' : 'profileTitle' : id === 'media' ? 'conversationMedia' : id === 'files' ? 'channelInfoTabFiles' : 'channelInfoTabPins')}
          </button>
        ))}
      </div>
      <div id="conversation-tabpanel" role="tabpanel" aria-labelledby={`conversation-tab-${tab}`} className="min-h-0 flex-1 overflow-hidden">
        {tab === 'media' || tab === 'files' ? (
          <AttachmentBrowser key={`${conversation.id}:${tab}`} kind={tab} loadPage={loadPage} emptyLabel={t(tab === 'media' ? 'conversationMediaEmpty' : 'conversationFilesEmpty')} onJump={jump} />
        ) : tab === 'pins' ? (
          <SimpleBar className="h-full">
            {pinned.pinnedError ? (
              <div role="alert" className="px-3 py-8 text-center text-sm text-gray-400">
                <p>{t('conversationLoadFailed')}</p>
                <button type="button" onClick={() => void pinned.loadPinned()} className="mt-2 text-primary">{t('conversationRetry')}</button>
              </div>
            ) : <PinnedMessagesList messages={pinned.pinnedMessages} loading={pinned.pinnedLoading} canUnpin conversationId={conversation.id} onJump={jump} emptyLabel={t('pinnedEmptyDm')} jumpLabel={t('jumpToMessage')} />}
          </SimpleBar>
        ) : conversation.isGroup ? (
          <GroupConversationDetails key={conversation.id} conversation={conversation} currentUserId={currentUserId} onClose={onClose} />
        ) : otherMember ? <div className="h-full [&>div]:h-full [&>div]:w-full [&>div]:border-0"><DmProfilePanel member={otherMember} mutualServers={mutualServers} /></div> : null}
      </div>
    </div>
  )
  if (isMobile) return <BottomSheet open onClose={onClose} maxHeightDvh={88} bodyScrollable={false}>{content}</BottomSheet>
  return <aside className="flex h-full w-80 shrink-0 flex-col border-l border-white/10 bg-surface-dark">{content}</aside>
}
