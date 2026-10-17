import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { Kbd } from '@/components/ui/Kbd'
import { ModalOverlay } from '@/components/ui/ModalOverlay'
import { useBuiltInCommands } from '@/lib/commands/useBuiltInCommands'
import {
  type Command,
  type CommandSection,
  filterCommands,
  groupCommandsBySection,
  selectRegisteredCommands,
  useCommandRegistry
} from '@/lib/commands/registry'

const SECTION_LABEL_KEYS: Record<CommandSection, string> = {
  navigation: 'paletteSectionNavigation',
  actions: 'paletteSectionActions',
  status: 'paletteSectionStatus',
  settings: 'paletteSectionSettings',
  mod: 'paletteSectionMod',
  help: 'paletteSectionHelp'
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('nav')
  const { t: tCommon } = useTranslation('common')
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const builtInCommands = useBuiltInCommands()
  // `selectRegisteredCommands` returns a fresh array on every call. Without
  // `useShallow`, Zustand 5's default Object.is comparison treats every render
  // as a state change and triggers the "getSnapshot should be cached" infinite
  // loop. Shallow-compare keeps the snapshot stable until the underlying Map
  // actually changes.
  const registeredCommands = useCommandRegistry(useShallow(selectRegisteredCommands))

  const allCommands = useMemo(() => [...builtInCommands, ...registeredCommands], [builtInCommands, registeredCommands])

  const filtered = useMemo(() => filterCommands(allCommands, query), [allCommands, query])
  const grouped = useMemo(() => groupCommandsBySection(filtered), [filtered])

  const flatItems: Command[] = useMemo(() => {
    const out: Command[] = []
    for (const [, cmds] of grouped) out.push(...cmds)
    return out
  }, [grouped])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [open])

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  const runCommand = useCallback(
    async (cmd: Command) => {
      try {
        await cmd.run({ navigate, close })
      } catch {
        /* commands are responsible for their own error surfaces */
      }
    },
    [navigate, close]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % Math.max(flatItems.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + flatItems.length) % Math.max(flatItems.length, 1))
      } else if (e.key === 'Enter' && flatItems.length > 0) {
        e.preventDefault()
        void runCommand(flatItems[selectedIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [flatItems, selectedIndex, runCommand, onClose]
  )

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  let runningIndex = 0

  return (
    <ModalOverlay
      onClose={onClose}
      aria-label={t('commandPalette')}
      maxWidth="max-w-lg"
      zIndex="z-[400]"
      noPadding
      className="self-start mt-4 md:mt-[15vh]"
    >
      <div className="w-full">
        <div className="composite-text-field flex items-center gap-2 rounded-t-xl border-b border-white/10 px-4 py-3 transition focus-within:ring-2 focus-within:ring-primary/55">
          <svg
            className="h-5 w-5 shrink-0 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={t('commandPalette')}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={flatItems[selectedIndex] ? `${listId}-${flatItems[selectedIndex].id}` : undefined}
            onKeyDown={handleKeyDown}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('quickSwitcherPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded text-gray-400 transition hover:bg-white/10 hover:text-white md:hidden"
            aria-label={tCommon('close')}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <Kbd className="hidden md:inline-flex">ESC</Kbd>
        </div>

        <div
          id={listId}
          ref={listRef}
          className="chat-scroll max-h-[60dvh] overflow-y-auto p-2 md:max-h-[22rem]"
          role="listbox"
          aria-label={t('commandPalette')}
        >
          {flatItems.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-gray-500">{t('quickSwitcherNoResults')}</p>
          )}

          {Array.from(grouped.entries()).map(([section, cmds]) => {
            if (cmds.length === 0) return null
            const sectionLabel = t(SECTION_LABEL_KEYS[section])
            const sectionBlock = (
              <div key={section}>
                <p className="px-2 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {sectionLabel}
                </p>
                {cmds.map((cmd) => {
                  const index = runningIndex++
                  const selected = selectedIndex === index
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      id={`${listId}-${cmd.id}`}
                      tabIndex={-1}
                      aria-selected={selected}
                      data-selected={selected}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        selected ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/[0.06] hover:text-white'
                      }`}
                      onClick={() => void runCommand(cmd)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      {cmd.icon}
                      <span className="truncate">{cmd.label}</span>
                      {cmd.hint && <span className="ml-auto text-xs text-gray-500">{cmd.hint}</span>}
                      {cmd.shortcut && cmd.shortcut.length > 0 && (
                        <span className={`flex shrink-0 items-center gap-1 ${cmd.hint ? 'ml-2' : 'ml-auto'}`}>
                          {cmd.shortcut.map((key, i) => (
                            <span key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-[10px] text-gray-500">+</span>}
                              <Kbd>{key}</Kbd>
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )
            return sectionBlock
          })}
        </div>
      </div>
    </ModalOverlay>
  )
}
