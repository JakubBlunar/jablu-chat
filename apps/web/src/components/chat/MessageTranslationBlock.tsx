import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@chat/shared'
import { MarkdownContent } from '@/components/MarkdownContent'
import { GlobeIcon } from '@/components/chat/chatIcons'
import { TranslateModal } from '@/components/chat/TranslateModal'
import { useTranslationStore } from '@/stores/translation.store'
import { messageTranslationVersion } from '@/lib/messageTranslationVersion'

interface Props {
  message: Message
}

/**
 * Renders the on-demand translation of a message below its content.
 * Session-only: the text lives in the translation store, never the DB.
 */
export function MessageTranslationBlock({ message }: Props) {
  const { t } = useTranslation('chat')
  const translation = useTranslationStore((s) => s.translations[message.id])
  const pendingTarget = useTranslationStore((s) => s.pending[message.id])
  const pendingSourceVersion = useTranslationStore((s) => s.pendingSourceVersions[message.id])
  const invalidate = useTranslationStore((s) => s.invalidate)
  const toggleHidden = useTranslationStore((s) => s.toggleHidden)
  const sourceVersion = messageTranslationVersion(message)
  const [picker, setPicker] = useState<{ messageId: string; sourceVersion: string } | null>(null)

  useEffect(() => {
    const state = useTranslationStore.getState()
    const cached = state.translations[message.id]
    if (
      (cached && cached.sourceVersion !== sourceVersion) ||
      (state.pending[message.id] && state.pendingSourceVersions[message.id] !== sourceVersion)
    ) {
      invalidate(message.id)
    }
  }, [message.id, sourceVersion, translation, pendingTarget, pendingSourceVersion, invalidate])

  if (!translation || translation.sourceVersion !== sourceVersion) return null

  const languageName = (code: string) => {
    const cap = useTranslationStore.getState().capabilities
    return cap?.languages.find((l) => l.code === code)?.name ?? code
  }

  if (translation.hidden) {
    return (
      <button
        type="button"
        onClick={() => toggleHidden(message.id)}
        className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 transition hover:text-gray-300"
        aria-label={t('translateShow')}
      >
        <GlobeIcon className="h-3.5 w-3.5" />
        {t('translateShow')}
      </button>
    )
  }

  return (
    <div className="mt-1.5 rounded-md border-l-2 border-primary/40 bg-white/[0.03] py-1.5 pl-3 pr-2">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {t('translateFrom', { lang: languageName(translation.detectedLang ?? 'auto') })}
        </span>
        <button
          type="button"
          onClick={() => setPicker({ messageId: message.id, sourceVersion })}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-primary transition hover:bg-primary/10"
        >
          <GlobeIcon className="h-3 w-3" />
          {languageName(translation.targetLang)}
        </button>
        <button
          type="button"
          onClick={() => toggleHidden(message.id)}
          className="rounded px-1.5 py-0.5 text-xs text-gray-500 transition hover:bg-white/5 hover:text-gray-300"
        >
          {t('translateHide')}
        </button>
      </div>
      <MarkdownContent content={translation.content} />
      {picker?.messageId === message.id && picker.sourceVersion === sourceVersion && (
        <TranslateModal
          messageId={message.id}
          sourceVersion={sourceVersion}
          initialTarget={translation.targetLang}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  )
}
