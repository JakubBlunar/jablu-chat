import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChannelDescriptionBlock } from '@/components/channel/ChannelDescriptionBlock'
import { ChannelMediaGrid } from '@/components/channel/ChannelMediaGrid'
import { ChannelFilesList } from '@/components/channel/ChannelFilesList'

type DrawerTab = 'images' | 'files'

interface ChannelInfoDrawerProps {
  onClose: () => void
  channelName: string
  channelDescription?: string | null
  channelId: string
  serverId: string
}

export function ChannelInfoDrawer({
  onClose,
  channelName,
  channelDescription,
  channelId,
  serverId
}: ChannelInfoDrawerProps) {
  const { t } = useTranslation('chat')
  const [tab, setTab] = useState<DrawerTab>('images')

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-surface-dark md:w-72">
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/20 px-3">
        <h2 className="min-w-0 truncate text-base font-semibold text-white">
          <span className="text-gray-400"># </span>
          {channelName}
        </h2>
        <button
          type="button"
          aria-label={t('close', { defaultValue: 'Close' })}
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ChannelDescriptionBlock
        channelName={channelName}
        description={channelDescription}
        className="shrink-0 border-b border-black/20 px-3 py-3"
      />

      <div className="flex shrink-0 gap-1 border-b border-black/20 px-2">
        <DrawerTabButton active={tab === 'images'} onSelect={() => setTab('images')} label={t('channelInfoTabImages')} />
        <DrawerTabButton active={tab === 'files'} onSelect={() => setTab('files')} label={t('channelInfoTabFiles')} />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'images' ? (
          <ChannelMediaGrid serverId={serverId} channelId={channelId} />
        ) : (
          <ChannelFilesList serverId={serverId} channelId={channelId} />
        )}
      </div>
    </aside>
  )
}

function DrawerTabButton({
  active,
  onSelect,
  label
}: {
  active: boolean
  onSelect: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex-1 py-2.5 text-center text-sm font-semibold transition ${
        active ? 'text-primary' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
      {active && <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />}
    </button>
  )
}
