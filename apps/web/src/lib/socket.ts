/// <reference types="vite/client" />
import { io, type Socket } from 'socket.io-client'
import { api } from './api'
import { getAppVisibilityState } from './appVisibility'
import { getDeviceId, getDevicePlatform } from './deviceId'
import { getServerBaseUrl } from './serverUrl'

let socket: Socket | null = null
let cleanupVisibility: (() => void) | null = null

function getSocketUrl(): string {
  if (api.baseUrl) return api.baseUrl
  if (import.meta.env.DEV) return 'http://localhost:3001'
  return getServerBaseUrl()
}

export function connectSocket(token: string): Socket {
  if (socket) {
    socket.disconnect()
    socket = null
  }
  cleanupVisibility?.()
  cleanupVisibility = null

  const initial = getAppVisibilityState()
  socket = io(getSocketUrl(), {
    // Seed the server's push gate from the handshake so there is no window where a
    // freshly connected, on-screen client still looks away and gets a pointless push.
    auth: {
      token,
      deviceId: getDeviceId(),
      platform: getDevicePlatform(),
      visibility: initial.visibility,
      focused: initial.focused
    },
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
