import { create } from 'zustand'

type LayoutState = {
  navDrawerOpen: boolean
  memberDrawerOpen: boolean
  /** Desktop channel-info drawer. Transient (not persisted); suppresses the member sidebar while open. */
  channelInfoDrawerOpen: boolean

  openNavDrawer: () => void
  closeNavDrawer: () => void
  openMemberDrawer: () => void
  closeMemberDrawer: () => void
  openChannelInfoDrawer: () => void
  closeChannelInfoDrawer: () => void
  toggleChannelInfoDrawer: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  navDrawerOpen: false,
  memberDrawerOpen: false,
  channelInfoDrawerOpen: false,

  openNavDrawer: () => set({ navDrawerOpen: true }),
  closeNavDrawer: () => set({ navDrawerOpen: false }),
  openMemberDrawer: () => set({ memberDrawerOpen: true }),
  closeMemberDrawer: () => set({ memberDrawerOpen: false }),
  openChannelInfoDrawer: () => set({ channelInfoDrawerOpen: true }),
  closeChannelInfoDrawer: () => set({ channelInfoDrawerOpen: false }),
  toggleChannelInfoDrawer: () => set((s) => ({ channelInfoDrawerOpen: !s.channelInfoDrawerOpen }))
}))
