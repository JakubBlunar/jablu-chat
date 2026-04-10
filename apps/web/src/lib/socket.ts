import { io, type Socket } from 'socket.io-client'
import { api } from './api'
import { getStoredServerUrl } from '@/stores/settings.store'
import { isElectron } from './electron'

let socket: Socket | null = null
let cleanupVisibility: (() => void) | null = null

function getSocketUrl(): string {
  if (api.baseUrl) return api.baseUrl
  if (isElectron) return getStoredServerUrl() ?? ''
  if (import.meta.env.DEV) return 'http://localhost:3001'
  return ''
}

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  cleanupVisibility?.()
  cleanupVisibility = null

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  })

  const s = socket
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !s.connected) {
      s.connect()
    }
  }
  document.addEventListener('visibilitychange', onVisible)
  cleanupVisibility = () => document.removeEventListener('visibilitychange', onVisible)

  return socket
}

export function disconnectSocket(): void {
  cleanupVisibility?.()
  cleanupVisibility = null
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function getSocket(): Socket | null {
  return socket
}
