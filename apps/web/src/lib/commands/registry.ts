import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { create } from 'zustand'

export type CommandSection =
  | 'navigation'
  | 'actions'
  | 'status'
  | 'settings'
  | 'mod'
  | 'help'

export type CommandContext = {
  navigate: NavigateFunction
  close: () => void
}

export type Command = {
  id: string
  label: string
  keywords?: string[]
  section: CommandSection
  icon?: ReactNode
  /** Optional display hint for a keyboard shortcut, e.g. ['Ctrl', 'K']. */
  shortcut?: string[]
  /** Optional trailing hint rendered on the right, e.g. server name. */
  hint?: string
  /** Guard used to hide commands that aren't currently usable (e.g. no permission). */
  available?: boolean
  run: (ctx: CommandContext) => void | Promise<void>
}

type CommandRegistryState = {
  commands: Map<string, Command>
  register: (command: Command) => () => void
  unregister: (id: string) => void
}

export const useCommandRegistry = create<CommandRegistryState>((set) => ({
  commands: new Map(),

  register: (command) => {
    set((state) => {
      const next = new Map(state.commands)
      next.set(command.id, command)
      return { commands: next }
    })
    return () => useCommandRegistry.getState().unregister(command.id)
  },

  unregister: (id) => {
    set((state) => {
      if (!state.commands.has(id)) return state
      const next = new Map(state.commands)
      next.delete(id)
      return { commands: next }
    })
  }
}))

/**
 * Register an ad-hoc command imperatively (outside the built-in set). Returns
 * an unregister function suitable for a `useEffect` cleanup.
 */
export function registerCommand(command: Command): () => void {
  return useCommandRegistry.getState().register(command)
}

/**
 * Selector returning the current registered commands as an array.
 *
 * IMPORTANT: this produces a fresh array on every call, so React/Zustand
 * subscribers must pair it with `useShallow` (or equivalent) to avoid the
 * "getSnapshot should be cached to avoid an infinite loop" warning.
 */
export function selectRegisteredCommands(state: CommandRegistryState): Command[] {
  return Array.from(state.commands.values())
}

export const SECTION_ORDER: readonly CommandSection[] = [
  'navigation',
  'actions',
  'status',
  'settings',
  'mod',
  'help'
] as const

function normalizedHaystack(cmd: Command): string {
  const parts = [cmd.label, cmd.hint ?? '', ...(cmd.keywords ?? [])]
  return parts.join(' ').toLowerCase()
}

/**
 * Rank commands by a simple substring match on label/keywords/hint. Commands
 * whose `available` is explicitly `false` are filtered out.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const visible = commands.filter((c) => c.available !== false)
  if (!query.trim()) return visible
  const q = query.toLowerCase()
  return visible.filter((c) => normalizedHaystack(c).includes(q))
}

export function groupCommandsBySection(commands: Command[]): Map<CommandSection, Command[]> {
  const grouped = new Map<CommandSection, Command[]>()
  for (const section of SECTION_ORDER) grouped.set(section, [])
  for (const cmd of commands) {
    const bucket = grouped.get(cmd.section) ?? []
    bucket.push(cmd)
    grouped.set(cmd.section, bucket)
  }
  return grouped
}
