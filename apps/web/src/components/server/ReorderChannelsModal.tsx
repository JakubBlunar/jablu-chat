import type { Channel, ChannelCategory } from '@chat/shared'
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
import { useSortedChannels } from '@/hooks/useSortedChannels'

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

function SortableChannel({ channel }: { channel: Channel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: channel.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

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

function SortableCategory({ category, children }: { category: ChannelCategory; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `cat-${category.id}`
  })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border border-white/5 bg-white/[0.02] ${isDragging ? 'z-50 opacity-75 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="cursor-grab touch-none active:cursor-grabbing" {...attributes} {...listeners}>
          <GripIcon />
        </button>
        <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">{category.name}</span>
      </div>
      <div className="space-y-1 px-3 pb-3">{children}</div>
    </div>
  )
}

function ChannelSortableList({
  items,
  onReorder
}: {
  items: Channel[]
  onReorder: (items: Channel[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((ch) => (
            <SortableChannel key={ch.id} channel={ch} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

type CategoryState = {
  category: ChannelCategory
  channels: Channel[]
}

export function ReorderChannelsModal({ onClose }: { onClose: () => void }) {
  const channels = useChannelStore((s) => s.channels)
  const categories = useChannelStore((s) => s.categories)
  const serverId = useServerStore((s) => s.currentServerId)

  const { uncategorizedText, uncategorizedVoice, categoryGroups } = useSortedChannels(channels, categories)

  const [uncatChannels, setUncatChannels] = useState<Channel[]>(() => [...uncategorizedText, ...uncategorizedVoice])
  const [catOrder, setCatOrder] = useState<CategoryState[]>(() =>
    categoryGroups.map((g) => ({
      category: g.category,
      channels: [...g.textChannels, ...g.voiceChannels]
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialUncatIds = useMemo(
    () => [...uncategorizedText, ...uncategorizedVoice].map((c) => c.id),
    [uncategorizedText, uncategorizedVoice]
  )
  const initialCatIds = useMemo(
    () => categoryGroups.map((g) => g.category.id),
    [categoryGroups]
  )
  const initialCatChannelIds = useMemo(
    () =>
      Object.fromEntries(
        categoryGroups.map((g) => [g.category.id, [...g.textChannels, ...g.voiceChannels].map((c) => c.id)])
      ),
    [categoryGroups]
  )

  const hasChanges = useMemo(() => {
    const uncatChanged = uncatChannels.some((c, i) => c.id !== initialUncatIds[i])
    const catOrderChanged = catOrder.some((c, i) => c.category.id !== initialCatIds[i])
    const catChannelsChanged = catOrder.some((cs) => {
      const initial = initialCatChannelIds[cs.category.id]
      if (!initial) return true
      return cs.channels.some((c, i) => c.id !== initial[i])
    })
    return uncatChanged || catOrderChanged || catChannelsChanged
  }, [uncatChannels, catOrder, initialUncatIds, initialCatIds, initialCatChannelIds])

  const catSortSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const catSortIds = useMemo(() => catOrder.map((c) => `cat-${c.category.id}`), [catOrder])

  const handleCatDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        const oldIdx = catOrder.findIndex((c) => `cat-${c.category.id}` === active.id)
        const newIdx = catOrder.findIndex((c) => `cat-${c.category.id}` === over.id)
        setCatOrder(arrayMove(catOrder, oldIdx, newIdx))
      }
    },
    [catOrder]
  )

  const updateCatChannels = useCallback((catId: string, newChannels: Channel[]) => {
    setCatOrder((prev) => prev.map((cs) => (cs.category.id === catId ? { ...cs, channels: newChannels } : cs)))
  }, [])

  const handleSave = useCallback(async () => {
    if (!serverId) return
    setSaving(true)
    setError(null)
    try {
      const newCatIds = catOrder.map((c) => c.category.id)
      const catOrderChanged = newCatIds.some((id, i) => id !== initialCatIds[i])

      const allChannelIds = [
        ...uncatChannels.map((c) => c.id),
        ...catOrder.flatMap((cs) => cs.channels.map((c) => c.id))
      ]

      const promises: Promise<void>[] = []
      if (catOrderChanged) {
        promises.push(api.reorderCategories(serverId, newCatIds))
      }
      promises.push(api.reorderChannels(serverId, allChannelIds))

      await Promise.all(promises)

      useChannelStore.getState().applyReorder(allChannelIds)
      if (catOrderChanged) {
        useChannelStore.getState().applyCategoryReorder(newCatIds)
      }
      onClose()
    } catch {
      setError('Failed to save order. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [serverId, catOrder, uncatChannels, initialCatIds, onClose])

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
          Drag channels to reorder within their group. Drag categories to reorder them relative to each other.
        </p>

        {uncatChannels.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">Uncategorized</h4>
            <ChannelSortableList items={uncatChannels} onReorder={setUncatChannels} />
          </div>
        )}

        {catOrder.length > 0 && (
          <DndContext sensors={catSortSensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
            <SortableContext items={catSortIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {catOrder.map((cs) => (
                  <SortableCategory key={cs.category.id} category={cs.category}>
                    <ChannelSortableList
                      items={cs.channels}
                      onReorder={(newChannels) => updateCatChannels(cs.category.id, newChannels)}
                    />
                  </SortableCategory>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
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
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-text transition hover:bg-primary/80 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </ModalOverlay>
  )
}
