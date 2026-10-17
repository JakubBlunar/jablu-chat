import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SimpleBar from 'simplebar-react'
import { api, ApiError, resolveMediaUrl, type DmConversation } from '@/lib/api'
import { UserAvatar } from '@/components/UserAvatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useDmStore } from '@/stores/dm.store'
import { useAppNavigate } from '@/hooks/useAppNavigate'
import { GroupDmModal } from './GroupDmModal'

export function GroupConversationDetails({
  conversation,
  currentUserId,
  onClose,
  onDialogOpenChange
}: {
  conversation: DmConversation
  currentUserId?: string
  onClose: () => void
  onDialogOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('chat')
  const { t: tCommon } = useTranslation('common')
  const { goToFriends } = useAppNavigate()
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const name = nameDraft ?? conversation.groupName ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  useEffect(() => {
    onDialogOpenChange?.(addOpen || confirmLeave)
    return () => onDialogOpenChange?.(false)
  }, [addOpen, confirmLeave, onDialogOpenChange])
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) {
      setError(error instanceof ApiError ? error.message : t('conversationActionFailed'))
    } finally {
      setBusy(false)
    }
  }
  const save = (action: () => Promise<DmConversation>) =>
    run(async () => {
      useDmStore.getState().addOrUpdateConversation(await action())
    })
  return (
    <>
      <SimpleBar className="h-full">
        <div className="space-y-4 px-3 py-4">
          {conversation.groupAvatarUrl && (
            <img
              src={resolveMediaUrl(conversation.groupAvatarUrl)}
              alt=""
              className="h-16 w-16 rounded-full object-cover"
            />
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void run(async () => {
                const updated = await api.updateGroupDm(conversation.id, { groupName: name.trim() || null })
                useDmStore.getState().addOrUpdateConversation(updated)
                setNameDraft(null)
              })
            }}
          >
            <label className="block text-xs text-gray-400" htmlFor="dm-group-name">
              {t('conversationGroupName')}
            </label>
            <input
              id="dm-group-name"
              value={name}
              disabled={busy}
              maxLength={100}
              onChange={(event) => setNameDraft(event.target.value)}
              className="mt-1 w-full rounded bg-surface-darkest px-2 py-2 text-sm text-white"
            />
            <button
              type="submit"
              disabled={busy || name.trim() === (conversation.groupName ?? '')}
              className="mt-2 text-sm text-primary disabled:opacity-40"
            >
              {t('conversationSave')}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className={`cursor-pointer text-primary ${busy ? 'pointer-events-none opacity-40' : ''}`}>
              {t('conversationChangeAvatar')}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) void save(() => api.uploadGroupDmAvatar(conversation.id, file))
                }}
              />
            </label>
            {conversation.groupAvatarUrl && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(() => api.removeGroupDmAvatar(conversation.id))}
                className="text-gray-400"
              >
                {t('conversationRemoveAvatar')}
              </button>
            )}
          </div>
          <p className="text-sm text-gray-400">
            {t('conversationMemberCount', { count: conversation.members.length })}
          </p>
          {conversation.members.map((member) => (
            <div key={member.userId} className="flex items-center gap-2 text-sm text-white">
              <UserAvatar username={member.username} avatarUrl={member.avatarUrl} size="md" />
              <span className="truncate">
                {member.displayName ?? member.username}
                {member.userId === currentUserId ? ` (${t('conversationYou')})` : ''}
              </span>
            </div>
          ))}
          <button
            type="button"
            disabled={busy || conversation.members.length >= 10}
            onClick={() => setAddOpen(true)}
            className="text-sm text-primary disabled:opacity-40"
          >
            {t('conversationAddMembers')}
          </button>
          <p className="text-xs text-gray-500">{t('conversationHistoryWarning')}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmLeave(true)}
            className="block text-sm text-red-400 disabled:opacity-40"
          >
            {t('conversationLeaveGroup')}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
        </div>
      </SimpleBar>
      {addOpen && (
        <GroupDmModal
          conversations={[]}
          currentUserId={currentUserId}
          addToConversation={conversation}
          onClose={() => setAddOpen(false)}
          onExisting={() => setAddOpen(false)}
          onCreated={(updated) => {
            useDmStore.getState().addOrUpdateConversation(updated)
            setAddOpen(false)
          }}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title={t('conversationLeaveGroup')}
          description={t('conversationLeaveWarning')}
          confirmLabel={t('conversationLeaveGroup')}
          cancelLabel={tCommon('cancel')}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false)
            void run(async () => {
              await api.leaveGroupDm(conversation.id)
              useDmStore.getState().removeConversation(conversation.id)
              onClose()
              goToFriends()
            })
          }}
        />
      )}
    </>
  )
}
