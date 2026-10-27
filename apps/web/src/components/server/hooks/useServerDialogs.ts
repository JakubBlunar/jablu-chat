import { useContext } from 'react'
import { ServerDialogsContext } from '../serverDialogsContext'

export function useServerDialogs() {
  const state = useContext(ServerDialogsContext)
  if (!state) throw new Error('Server dialogs require ServerDialogsProvider')
  return state
}
