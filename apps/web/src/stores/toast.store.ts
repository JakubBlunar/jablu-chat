import { create } from 'zustand'

export interface Toast {
  id: string
  title: string
  body: string
  url?: string
}

type ToastState = {
  toasts: Toast[]
  addToast: (title: string, body: string, url?: string) => void
  removeToast: (id: string) => void
}

let nextId = 0

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  addToast: (title, body, url) => {
    const id = `t-${++nextId}`
    set({ toasts: [...get().toasts.slice(-4), { id, title, body, url }] })
    setTimeout(() => get().removeToast(id), 5000)
  },

  removeToast: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

export function showToast(title: string, body: string, url?: string) {
  useToastStore.getState().addToast(title, body, url)
}
