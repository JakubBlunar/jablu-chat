import { app, BrowserWindow, desktopCapturer, ipcMain, Notification, Tray, Menu, nativeImage, net, protocol, session } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const DEV_URL = 'http://localhost:5173'
const isDev = !app.isPackaged
const MAX_RETRIES = 30
const RETRY_DELAY_MS = 2000
const CUSTOM_SCHEME = 'app'

protocol.registerSchemesAsPrivileged([
  {
    scheme: CUSTOM_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function loadDevUrl(win: BrowserWindow, attempt = 1) {
  win.loadURL(DEV_URL).catch(() => {
    if (attempt >= MAX_RETRIES) {
      console.error(`Vite dev server not reachable after ${MAX_RETRIES} attempts`)
      return
    }
    console.log(`Waiting for Vite dev server... (attempt ${attempt}/${MAX_RETRIES})`)
    setTimeout(() => loadDevUrl(win, attempt + 1), RETRY_DELAY_MS)
  })
}

function getIconPath() {
  if (isDev) {
    return join(__dirname, '..', '..', 'resources', 'icon-256.png')
  }
  return join(process.resourcesPath, 'icon-256.png')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    title: 'Jablu',
    icon: nativeImage.createFromPath(getIconPath()),
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    autoHideMenuBar: true
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Allow getUserMedia with screen capture from the renderer
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    // Allow all display media requests (the picker is handled in the renderer via IPC)
    callback({ video: undefined as unknown as Electron.DesktopCapturerSource })
  })

  if (isDev) {
    loadDevUrl(mainWindow)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL(`${CUSTOM_SCHEME}://jablu/index.html`)
  }
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath())
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('Jablu')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => mainWindow?.show()
    },
    {
      label: 'Quit',
      click: () => {
        tray = null
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow?.show())
}

function registerIpcHandlers() {
  ipcMain.handle('get-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 }
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon?.toDataURL() ?? null
    }))
  })

  ipcMain.handle('get-platform', () => process.platform)
  ipcMain.handle('get-version', () => app.getVersion())
  ipcMain.on('get-version-sync', (event) => {
    event.returnValue = app.getVersion()
  })

  ipcMain.handle('set-server-url', (_event, url: string) => {
    const { writeFileSync, mkdirSync } = require('fs') as typeof import('fs')
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    writeFileSync(join(userDataPath, 'server-url.txt'), url, 'utf-8')
  })

  ipcMain.handle('show-notification', (_event, payload: { title: string; body: string; url?: string }) => {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: payload.title,
        body: payload.body,
        icon: getIconPath()
      })
      notif.on('click', () => {
        mainWindow?.show()
        if (payload.url) {
          mainWindow?.webContents.send('navigate', payload.url)
        }
      })
      notif.show()
    }
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true)
    }
  })

  ipcMain.handle('set-tray-unread', (_event, count: number) => {
    if (tray) {
      tray.setToolTip(count > 0 ? `Jablu (${count} unread)` : 'Jablu')
    }
  })

  ipcMain.handle('get-auto-launch', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled })
    return app.getLoginItemSettings().openAtLogin
  })

  ipcMain.handle('test-server-url', async (_event, url: string) => {
    try {
      const resp = await net.fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) })
      return { ok: resp.ok }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('check-for-updates', () => {
    void checkForUpdates()
  })

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })
}

// ─── Auto Updater ────────────────────────────────────────────

function getStoredServerUrl(): string | null {
  try {
    const userDataPath = app.getPath('userData')
    const configPath = join(userDataPath, 'server-url.txt')
    if (existsSync(configPath)) {
      return readFileSync(configPath, 'utf-8').trim() || null
    }
  } catch {
    // ignore
  }
  return null
}

function setupAutoUpdater() {
  if (isDev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  const serverUrl = getStoredServerUrl()
  if (serverUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `${serverUrl}/api/updates`
    })
  }

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version
    })
  })

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', {
      message: err?.message ?? 'Update check failed'
    })
  })

  setTimeout(() => void checkForUpdates(), 5000)
  setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000)
}

async function checkForUpdates() {
  const serverUrl = getStoredServerUrl()
  if (!serverUrl) return

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `${serverUrl}/api/updates`
  })

  try {
    await autoUpdater.checkForUpdates()
  } catch {
    // silently ignore
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.tflite': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json'
}

function registerAppProtocol() {
  const webRoot = join(process.resourcesPath, 'web')

  protocol.handle(CUSTOM_SCHEME, (request) => {
    const url = new URL(request.url)
    const pathname = decodeURIComponent(url.pathname)

    // Proxy /api/ and /uploads/ to the actual server
    if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/')) {
      const serverUrl = getStoredServerUrl()
      if (serverUrl) {
        const headers = new Headers(request.headers)
        headers.set('Origin', serverUrl)
        headers.delete('Referer')
        const fetchOpts: Record<string, unknown> = {
          method: request.method,
          headers,
          body: request.body,
          duplex: 'half'
        }
        return net.fetch(`${serverUrl}${pathname}${url.search}`, fetchOpts as RequestInit)
      }
    }

    // Serve local files
    let filePath = join(webRoot, pathname === '/' ? 'index.html' : pathname)
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      filePath = join(webRoot, 'index.html')
    }

    const ext = extname(filePath).toLowerCase()
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream'
    const body = readFileSync(filePath)

    return new Response(body, {
      headers: { 'Content-Type': mimeType }
    })
  })
}

app.whenReady().then(() => {
  if (!isDev) registerAppProtocol()
  registerIpcHandlers()
  createWindow()
  createTray()
  setupAutoUpdater()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  } else {
    mainWindow.show()
  }
})
