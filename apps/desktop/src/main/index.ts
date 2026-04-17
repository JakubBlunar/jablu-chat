import { app, BrowserWindow, desktopCapturer, ipcMain, Notification, Tray, Menu, nativeImage, net, protocol, session } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import log from 'electron-log/main'
import { createPublicKey, verify } from 'crypto'
import { readFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { join, extname } from 'path'
import { pathToFileURL } from 'url'
import { UPDATE_PUBLIC_KEY_PEM, UPDATE_SIGNING_DISABLED_REASON } from './updateSigningKey.generated'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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
    if (tray && !isQuitting) {
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
        isQuitting = true
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
    if (!pendingUpdateManifestName) {
      mainWindow?.webContents.send('update-error', {
        message: 'Cannot install update: signature has not been verified.'
      })
      return
    }
    isQuitting = true
    autoUpdater.quitAndInstall(false, true)
  })

  ipcMain.handle('get-update-status', () => {
    return {
      lastCheckedAt: lastUpdateCheckAt,
      lastError: lastUpdateError,
      feedConfigured: !!getStoredServerUrl()
    }
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

let lastUpdateCheckAt: number | null = null
let lastUpdateError: string | null = null
let pendingUpdateManifestName: string | null = null

function getManifestFilename(): string {
  switch (process.platform) {
    case 'darwin':
      return 'latest-mac.yml'
    case 'linux':
      return 'latest-linux.yml'
    default:
      return 'latest.yml'
  }
}

async function verifyManifestSignature(feedUrl: string, manifestName: string): Promise<void> {
  if (!UPDATE_PUBLIC_KEY_PEM) {
    throw new Error(UPDATE_SIGNING_DISABLED_REASON ?? 'Update signing key is not configured.')
  }

  const ymlResp = await net.fetch(`${feedUrl}/${manifestName}`, { cache: 'no-cache' })
  if (!ymlResp.ok) throw new Error(`Failed to fetch ${manifestName}: HTTP ${ymlResp.status}`)
  const ymlBytes = Buffer.from(await ymlResp.arrayBuffer())

  const sigResp = await net.fetch(`${feedUrl}/${manifestName}.sig`, { cache: 'no-cache' })
  if (!sigResp.ok) throw new Error(`Failed to fetch ${manifestName}.sig: HTTP ${sigResp.status}`)
  const sigBytes = Buffer.from(await sigResp.arrayBuffer())

  const pubKey = createPublicKey({ key: UPDATE_PUBLIC_KEY_PEM, format: 'pem' })
  const ok = verify(null, ymlBytes, pubKey, sigBytes)
  if (!ok) throw new Error('Signature verification failed for update manifest')
}

function setupAutoUpdater() {
  if (isDev) return

  log.transports.file.fileName = 'update.log'
  log.transports.file.level = 'info'
  autoUpdater.autoDownload = true
  // Defer auto-install until the manifest signature has been verified.
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = log

  if (!UPDATE_PUBLIC_KEY_PEM) {
    log.warn(`Auto-update disabled: ${UPDATE_SIGNING_DISABLED_REASON ?? 'unknown reason'}`)
    lastUpdateError = UPDATE_SIGNING_DISABLED_REASON
    return
  }

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
    const manifestName = getManifestFilename()
    const feedUrl = currentFeedUrl()
    if (!feedUrl) {
      log.error('update-downloaded: no feed URL configured; cannot verify signature')
      mainWindow?.webContents.send('update-error', {
        message: 'Update downloaded but cannot verify: server URL is not configured.'
      })
      return
    }
    verifyManifestSignature(feedUrl, manifestName)
      .then(() => {
        log.info(`Signature verified for ${manifestName}; install is allowed`)
        autoUpdater.autoInstallOnAppQuit = true
        pendingUpdateManifestName = manifestName
        mainWindow?.webContents.send('update-downloaded', { version: info.version })
      })
      .catch((err: Error) => {
        log.error('Signature verification failed', err)
        autoUpdater.autoInstallOnAppQuit = false
        pendingUpdateManifestName = null
        // Remove the untrusted installer so autoInstallOnAppQuit can't accidentally run it.
        const dlPath = (info as UpdateInfo & { downloadedFile?: string }).downloadedFile
        if (dlPath) {
          try {
            unlinkSync(dlPath)
            log.info(`Deleted untrusted installer at ${dlPath}`)
          } catch (unlinkErr) {
            log.warn(`Could not delete untrusted installer at ${dlPath}`, unlinkErr)
          }
        }
        lastUpdateError = err.message
        mainWindow?.webContents.send('update-error', {
          message: `Update rejected: ${err.message}`
        })
      })
  })

  autoUpdater.on('error', (err) => {
    const message = err?.message ?? 'Update check failed'
    lastUpdateError = message
    log.error('auto-updater error', err)
    mainWindow?.webContents.send('update-error', { message })
  })

  autoUpdater.on('checking-for-update', () => {
    lastUpdateCheckAt = Date.now()
    lastUpdateError = null
  })

  setTimeout(() => void checkForUpdates(), 5000)
  setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000)
}

function currentFeedUrl(): string | null {
  const serverUrl = getStoredServerUrl()
  return serverUrl ? `${serverUrl}/api/updates` : null
}

interface CompatResponse {
  supported: boolean
  minClient: string
  maxClient: string | null
  clientVersion: string | null
  reason: 'client-too-old' | 'client-too-new' | null
}

async function fetchCompat(feedUrl: string): Promise<CompatResponse | null> {
  try {
    const version = app.getVersion()
    const resp = await net.fetch(`${feedUrl}/compat?client=${encodeURIComponent(version)}`, {
      cache: 'no-cache',
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) return null
    return (await resp.json()) as CompatResponse
  } catch (err) {
    log.warn('compat fetch failed', err)
    return null
  }
}

async function checkForUpdates() {
  if (!UPDATE_PUBLIC_KEY_PEM) return
  const feedUrl = currentFeedUrl()
  if (!feedUrl) return

  const compat = await fetchCompat(feedUrl)
  if (compat && !compat.supported) {
    lastUpdateError = `Server is not compatible with this client (reason: ${compat.reason ?? 'unknown'}).`
    log.warn('Skipping update check due to compat failure', compat)
    mainWindow?.webContents.send('update-incompatible', compat)
    return
  }

  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })

  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    log.warn('checkForUpdates threw', err)
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

app.on('before-quit', () => {
  isQuitting = true
})

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
