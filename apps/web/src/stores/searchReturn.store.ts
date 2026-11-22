import { create } from 'zustand'
import type { Scope } from '@/components/search/useMessageSearch'

export interface SearchReturn {
  query: string
  scope: Scope
  serverId: string | null
  channelId: string | null
  conversationId?: string
  offset: number
  scrollTop: number
  resultId: string
  filtersOpen: boolean
}
export const useSearchReturn = create<{ saved: SearchReturn | null; open: boolean }>(() => ({
  saved: null,
  open: false
}))
