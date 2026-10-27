import type { ReactNode } from 'react'
import { useServerStore } from '@/stores/server.store'
import { ServerDialogsContext } from './serverDialogsContext'
import { useServerDialogState } from './hooks/useServerDialogState'
import { ServerDialogs } from './ServerDialogs'

export function ServerDialogsProvider({ children }: { children: ReactNode }) {
  const serverId = useServerStore((state) => state.currentServerId)
  const state = useServerDialogState(serverId)
  return (
    <ServerDialogsContext.Provider value={state}>
      {children}
      <ServerDialogs state={state} />
    </ServerDialogsContext.Provider>
  )
}
