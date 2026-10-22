import {
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Dispatch,
  type Ref,
  type RefObject,
  type SetStateAction
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { lazyWithRetry } from '@/lib/lazyWithRetry'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ConfirmDialog, Spinner } from '@/components/ui'
import { IconButton } from '@/components/ui/IconButton'
import {
  BookmarkIcon,
  CopyIcon,
  EditIcon,
  ForwardIcon,
  GlobeIcon,
  LinkIcon,
  MoreIcon,
  ShareIcon,
  MessagePinIcon,
  ReplyIcon,
  SmileIcon,
  ThreadIcon,
  TrashIcon
} from '@/components/chat/chatIcons'
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal'
import { TranslateModal } from '@/components/chat/TranslateModal'
import { MessageActionsMenu, type MessageMenuItem } from '@/components/chat/MessageActionsMenu'
import {
  useMessageActionController,
  type MessageActionOptions
} from '@/components/chat/hooks/useMessageActionController'
import { useMessageDeletion } from '@/components/chat/hooks/useMessageDeletion'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'
import { toggleMessageReactionAndRemember } from '@/lib/reactions'
import { useEmojiStore, EMPTY_EMOJIS } from '@/stores/emoji.store'
import { useRecentReactions } from '@/stores/reactions.store'
import { showToast } from '@/stores/toast.store'

const EmojiPicker = lazyWithRetry(() => import('@/components/EmojiPicker').then((m) => ({ default: m.EmojiPicker })))
type ActionView = 'menu' | 'emoji' | 'delete' | 'forward' | 'translate' | null
export type MessageContextMenuPosition = { x: number; y: number }
export type MessageActionsHandle = {
  openContextMenu: (position: MessageContextMenuPosition, trigger: HTMLElement) => void
}

export function MessageActions({ ref, ...props }: MessageActionOptions & { ref?: Ref<MessageActionsHandle> }) {
  const { t } = useTranslation('chat')
  const recent = useRecentReactions()
  const [view, setView] = useState<ActionView>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const contextTriggerRef = useRef<HTMLElement | null>(null)
  const [contextPosition, setContextPosition] = useState<MessageContextMenuPosition | null>(null)
  useImperativeHandle(
    ref,
    () => ({
      openContextMenu(position, trigger) {
        contextTriggerRef.current = trigger
        trigger.focus({ preventScroll: true })
        setContextPosition(position)
        setView('menu')
      }
    }),
    []
  )
  return (
    <div
      ref={toolbarRef}
      className="pointer-events-none absolute right-2 top-0 z-10 flex translate-y-[calc(-100%+6px)] items-start"
    >
      <div
        className={`flex items-center gap-0.5 rounded bg-surface-dark p-0.5 shadow-lg ring-1 ring-white/10 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 ${view ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        {recent.map((emoji) => (
          <button
            key={emoji}
            type="button"
            title={t('actionAddReaction')}
            aria-label={`${t('actionAddReaction')} ${emoji}`}
            onClick={() =>
              void toggleMessageReactionAndRemember({ mode: props.mode, messageId: props.message.id, emoji })
            }
            className="flex h-7 w-7 items-center justify-center rounded text-[1.05rem] leading-none transition hover:bg-white/10"
          >
            {emoji}
          </button>
        ))}
        <IconButton
          label={t('actionAddReaction')}
          onClick={() => {
            setContextPosition(null)
            setView((current) => (current === 'emoji' ? null : 'emoji'))
          }}
        >
          <SmileIcon />
        </IconButton>
        <IconButton label={t('actionReply')} onClick={props.onReply}>
          <ReplyIcon />
        </IconButton>
        <IconButton
          ref={moreRef}
          label={t('actionMore')}
          aria-haspopup="menu"
          aria-expanded={view === 'menu'}
          active={view === 'menu'}
          onClick={() => {
            setContextPosition(null)
            setView((current) => (current === 'menu' ? null : 'menu'))
          }}
        >
          <MoreIcon />
        </IconButton>
      </div>
      {view && (
        <MessageActionSurface
          {...props}
          view={view}
          setView={setView}
          toolbarRef={toolbarRef}
          moreRef={moreRef}
          contextPosition={contextPosition}
          contextTriggerRef={contextTriggerRef}
        />
      )}
    </div>
  )
}

function MessageActionSurface({
  view,
  setView,
  toolbarRef,
  moreRef,
  contextPosition,
  contextTriggerRef,
  ...props
}: MessageActionOptions & {
  view: Exclude<ActionView, null>
  setView: Dispatch<SetStateAction<ActionView>>
  toolbarRef: RefObject<HTMLDivElement | null>
  moreRef: RefObject<HTMLButtonElement | null>
  contextPosition: MessageContextMenuPosition | null
  contextTriggerRef: RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation('chat')
  const { message, contextId } = props
  const actions = useMessageActionController({ ...props, onComplete: () => setView(null) })
  const close = () => setView(null)
  const deletion = useMessageDeletion(props.mode, contextId, message, close)
  const customEmojis = useEmojiStore((s) =>
    actions.serverId ? (s.byServer[actions.serverId] ?? EMPTY_EMOJIS) : EMPTY_EMOJIS
  )
  const pickerRef = useRef<HTMLDivElement>(null)
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number; above: boolean } | null>(null)

  useEffect(() => {
    if (view !== 'emoji') return
    const rect = contextPosition
      ? { top: contextPosition.y, bottom: contextPosition.y, right: contextPosition.x }
      : toolbarRef.current?.getBoundingClientRect()
    if (rect)
      setPickerPos({
        above: rect.top > 460,
        left: Math.max(8, Math.min(window.innerWidth - 328, rect.right - 320)),
        top: rect.top > 460 ? rect.top - 8 : rect.bottom + 8
      })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setView(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [view, toolbarRef, setView, contextPosition])

  useEffect(() => {
    if (view !== 'emoji' || !pickerPos || !pickerRef.current) return
    const rect = pickerRef.current.getBoundingClientRect()
    let left = pickerPos.left
    if (rect.right > window.innerWidth - 8) left -= rect.right - (window.innerWidth - 8)
    if (rect.left < 8) left += 8 - rect.left
    if (Math.abs(left - pickerPos.left) > 1) setPickerPos({ ...pickerPos, left })
  }, [view, pickerPos])

  const items: MessageMenuItem[] = [
    { id: 'react', label: t('actionAddReaction'), icon: <SmileIcon />, onClick: () => setView('emoji') },
    { id: 'reply', label: t('actionReply'), icon: <ReplyIcon />, onClick: actions.reply }
  ]
  if (actions.canForward)
    items.push({ id: 'forward', label: t('actionForward'), icon: <ForwardIcon />, onClick: () => setView('forward') })
  if (actions.canThread)
    items.push({
      id: 'thread',
      label: t(message.threadCount ? 'actionViewThread' : 'actionCreateThread'),
      icon: <ThreadIcon />,
      onClick: actions.thread
    })
  if (message.content)
    items.push({
      id: 'copy-text',
      label: t('actionCopyText'),
      icon: <CopyIcon className="h-4 w-4" />,
      onClick: () => void actions.copyText()
    })
  if (actions.canTranslate)
    items.push({
      id: 'translate',
      label: t('actionTranslate'),
      icon: <GlobeIcon />,
      onClick: () => actions.translate(() => setView('translate'))
    })
  if (actions.translationSetupError)
    items.push({
      id: 'translate-retry',
      label: t('translationSetupRetry'),
      icon: <GlobeIcon />,
      onClick: actions.retryTranslation
    })
  if (actions.canEdit) items.push({ id: 'edit', label: t('actionEdit'), icon: <EditIcon />, onClick: actions.edit })
  if (actions.canPin)
    items.push({
      id: 'pin',
      label: t(message.pinned ? 'actionUnpin' : 'actionPin'),
      icon: <MessagePinIcon />,
      onClick: () => void actions.pin()
    })
  if (actions.canBookmark)
    items.push({
      id: 'bookmark',
      label: t(actions.isBookmarked ? 'actionRemoveBookmark' : 'actionSaveMessage'),
      icon: <BookmarkIcon filled={actions.isBookmarked} />,
      onClick: () => void actions.bookmark()
    })
  if (actions.shareableUrl) {
    items.push({
      id: 'copy-link',
      label: t('actionCopyMessageLink'),
      icon: <LinkIcon className="h-4 w-4" />,
      onClick: () => void actions.copyLink()
    })
    items.push({
      id: 'share',
      label: t('actionShareMessage'),
      icon: <ShareIcon />,
      onClick: () => void actions.share()
    })
  }
  if (actions.canDelete)
    items.push({
      id: 'delete',
      label: t('actionDelete'),
      icon: <TrashIcon />,
      danger: true,
      onClick: () => setView('delete')
    })

  const react = (emoji: string, isCustom = false) => {
    void actions.react(emoji, isCustom)
  }
  return (
    <>
      {view === 'menu' && (
        <MessageActionsMenu
          anchorRef={contextPosition ? contextTriggerRef : moreRef}
          position={contextPosition ?? undefined}
          items={items}
          onClose={() => setView((current) => (current === 'menu' ? null : current))}
        />
      )}
      {view === 'delete' && (
        <ConfirmDialog
          title={t('actionDelete')}
          description={t('deleteMessageWarning')}
          confirmLabel={t(deletion.pending ? 'messageActionPending' : 'actionDelete')}
          cancelLabel={t('editCancel')}
          busy={deletion.pending}
          error={deletion.error}
          anchorRef={moreRef}
          onConfirm={() => void deletion.confirm()}
          onCancel={close}
        />
      )}
      {view === 'forward' && <ForwardMessageModal message={message} sourceChannelId={contextId} onClose={close} />}
      {view === 'translate' && (
        <TranslateModal messageId={message.id} sourceVersion={messageTranslationVersion(message)} onClose={close} />
      )}
      {view === 'emoji' &&
        pickerPos &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[130]"
            style={{
              left: pickerPos.left,
              top: pickerPos.above ? undefined : pickerPos.top,
              bottom: pickerPos.above ? window.innerHeight - pickerPos.top : undefined
            }}
          >
            <ErrorBoundary
              fallback={null}
              onError={() => {
                close()
                showToast(t('actionAddReaction'), t('emojiPickerFailed'))
              }}
            >
              <Suspense
                fallback={
                  <div className="flex h-24 w-[340px] max-w-[80vw] items-center justify-center rounded-xl bg-surface-dark shadow-2xl ring-1 ring-white/10">
                    <Spinner size="md" />
                  </div>
                }
              >
                <EmojiPicker
                  onSelect={(emoji) => react(emoji)}
                  onClose={close}
                  customEmojis={actions.isDm ? undefined : customEmojis}
                  reactionMode
                  onCustomSelect={actions.isDm ? undefined : (name) => react(name, true)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>,
          document.body
        )}
    </>
  )
}
