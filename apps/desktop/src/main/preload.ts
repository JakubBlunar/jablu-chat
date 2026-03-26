import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  getSources: () =>
    ipcRenderer.invoke('get-sources') as Promise<
      Array<{
        id: string
        name: string
        thumbnail: string
        appIcon: string | null
      }>
    >,

  platform: process.platform,
  appVersion: ipcRenderer.sendSync('get-version-sync') as string,

  showNotification: (title: string, body: string, url?: string) =>
    ipcRenderer.invoke('show-notification', { title, body, url }),

  onNavigate: (cb: (url: string) => void) => {
    const listener = (_: unknown, url: string) => cb(url)
    ipcRenderer.on('navigate', listener)
    return () => {
      ipcRenderer.removeListener('navigate', listener)
    }
  },
  setTrayUnread: (count: number) => ipcRenderer.invoke('set-tray-unread', count),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
  testServerUrl: (url: string) => ipcRenderer.invoke('test-server-url', url) as Promise<{ ok: boolean }>,
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch') as Promise<boolean>,
  setAutoLaunch: (enabled: boolean) => ipcRenderer.invoke('set-auto-launch', enabled) as Promise<boolean>,

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onUpdateAvailable: (cb: (info: { version: string }) => void) => {
    const listener = (_: unknown, info: { version: string }) => cb(info)
    ipcRenderer.on('update-available', listener)
    return () => {
      ipcRenderer.removeListener('update-available', listener)
    }
  },
  onUpdateNotAvailable: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('update-not-available', listener)
    return () => {
      ipcRenderer.removeListener('update-not-available', listener)
    }
  },
  onUpdateDownloadProgress: (cb: (progress: { percent: number; transferred: number; total: number }) => void) => {
    const listener = (_: unknown, progress: { percent: number; transferred: number; total: number }) => cb(progress)
    ipcRenderer.on('update-download-progress', listener)
    return () => {
      ipcRenderer.removeListener('update-download-progress', listener)
    }
  },
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => {
    const listener = (_: unknown, info: { version: string }) => cb(info)
    ipcRenderer.on('update-downloaded', listener)
    return () => {
      ipcRenderer.removeListener('update-downloaded', listener)
    }
  },
  onUpdateError: (cb: (err: { message: string }) => void) => {
    const listener = (_: unknown, err: { message: string }) => cb(err)
    ipcRenderer.on('update-error', listener)
    return () => {
      ipcRenderer.removeListener('update-error', listener)
    }
  }
})
