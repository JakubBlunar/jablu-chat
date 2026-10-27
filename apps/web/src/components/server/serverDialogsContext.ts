import { createContext } from 'react'
import type { ServerDialogState } from './hooks/useServerDialogState'

export const ServerDialogsContext = createContext<ServerDialogState | null>(null)
