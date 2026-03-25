import type { Channel } from '@chat/shared'
import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { api } from '@/lib/api'
import { useChannelStore } from '@/stores/channel.store'
import { useServerStore } from '@/stores/server.store'

function GripIcon() {
  return (
    <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  )
}

function SortableItem({ channel }: { channel: Channel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: channel.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border border-white/10 bg-surface-dark px-3 py-2 ${isDragging ? 'z-50 opacity-75 shadow-lg' : ''}`}
    >
      <button type="button" className="cursor-grab touch-none active:cursor-grabbing" {...attributes} {...listeners}>
        <GripIcon />
      </button>
      <span className="text-sm text-gray-300">{channel.type === 'text' ? '#' : '🔊'} </span>
      <span className="min-w-0 flex-1 truncate text-sm text-white">{channel.name}</span>
    </div>
  )
}

function SortableList({
  title,
  items,
  onReorder
}: {
  title: string
  items: Channel[]
  onReorder: (items: Channel[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const ids = useMemo(() => items.map((c) => c.id), [items])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIdx = items.findIndex((c) => c.id === active.id)
        const newIdx = items.findIndex((c) => c.id === over.id)
        onReorder(arrayMove(items, oldIdx, newIdx))
      }
    },
    [items, onReorder]
  )

  if (items.length === 0) return null

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">{title}</h4>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {items.map((ch) => (
              <SortableItem key={ch.id} channel={ch} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

export function ReorderChannelsModal({ onClose }: { onClose: () => void }) {
  const channels = useChannelStore((s) => s.channels)
  const serverId = useServerStore((s) => s.currentServerId)

  const initialText = useMemo(
    () => channels.filter((c) => c.type === 'text').sort((a, b) => a.position - b.position),
    [channels]
  )
  const initialVoice = useMemo(
    () => channels.filter((c) => c.type === 'voice').sort((a, b) => a.position - b.position),
    [channels]
  )

  const [textOrder, setTextOrder] = useState<Channel[]>(initialText)
  const [voiceOrder, setVoiceOrder] = useState<Channel[]>(initialVoice)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = useMemo(() => {
    const textChanged = textOrder.some((c, i) => c.id !== initialText[i]?.id)
    const voiceChanged = voiceOrder.some((c, i) => c.id !== initialVoice[i]?.id)
    return textChanged || voiceChanged
  }, [textOrder, voiceOrder, initialText, initialVoice])

  const handleSave = useCallback(async () => {
    if (!serverId) return
    setSaving(true)
    setError(null)
    try {
      const allIds = [...textOrder.map((c) => c.id), ...voiceOrder.map((c) => c.id)]
      await api.reorderChannels(serverId, allIds)
      useChannelStore.getState().applyReorder(allIds)
      onClose()
    } catch {
      setError('Failed to save channel order. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [serverId, textOrder, voiceOrder, onClose])

  return (
    <ModalOverlay onClose={onClose} noPadding className="flex max-h-[80vh] flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <h3 className="text-lg font-semibold text-white">Reorder Channels</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-sm text-gray-400">
          Drag channels to reorder them. Text and voice channels are reordered separately.
        </p>

        <SortableList title="Text Channels" items={textOrder} onReorder={setTextOrder} />
        <SortableList title="Voice Channels" items={voiceOrder} onReorder={setVoiceOrder} />
      </div>

      {error && <p className="px-5 text-sm text-red-400">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-md px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalOverlay>
  )
}
