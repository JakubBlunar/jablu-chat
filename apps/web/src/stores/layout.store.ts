import { create } from 'zustand'

type LayoutState = {
  navDrawerOpen: boolean
  memberDrawerOpen: boolean

  openNavDrawer: () => void
  closeNavDrawer: () => void
  openMemberDrawer: () => void
  closeMemberDrawer: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  navDrawerOpen: false,
  memberDrawerOpen: false,

  openNavDrawer: () => set({ navDrawerOpen: true }),
  closeNavDrawer: () => set({ navDrawerOpen: false }),
  openMemberDrawer: () => set({ memberDrawerOpen: true }),
  closeMemberDrawer: () => set({ memberDrawerOpen: false })
}))
