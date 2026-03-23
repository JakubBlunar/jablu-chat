import { app, BrowserWindow, desktopCapturer, ipcMain, Notification, Tray, Menu, nativeImage, session } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const DEV_URL = "http://localhost:5173";
const isDev = !app.isPackaged;
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

function loadDevUrl(win: BrowserWindow, attempt = 1) {
  win.loadURL(DEV_URL).catch(() => {
    if (attempt >= MAX_RETRIES) {
      console.error(`Vite dev server not reachable after ${MAX_RETRIES} attempts`);
      return;
    }
    console.log(`Waiting for Vite dev server... (attempt ${attempt}/${MAX_RETRIES})`);
    setTimeout(() => loadDevUrl(win, attempt + 1), RETRY_DELAY_MS);
  });
}

function getIconPath() {
  if (isDev) {
    return join(__dirname, "..", "..", "resources", "icon-256.png");
  }
  return join(process.resourcesPath, "icon-256.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    title: "Jablu",
    icon: nativeImage.createFromPath(getIconPath()),
    backgroundColor: "#1e1f22",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    autoHideMenuBar: true,
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  if (isDev) {
    loadDevUrl(mainWindow);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const webDistPath = join(process.resourcesPath, "web", "index.html");
    mainWindow.loadFile(webDistPath);
  }

  // Allow getUserMedia with screen capture from the renderer
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    // Allow all display media requests (the picker is handled in the renderer via IPC)
    callback({ video: undefined as unknown as Electron.DesktopCapturerSource });
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Jablu");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => mainWindow?.show(),
    },
    {
      label: "Quit",
      click: () => {
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => mainWindow?.show());
}

function registerIpcHandlers() {
  ipcMain.handle("get-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon?.toDataURL() ?? null,
    }));
  });

  ipcMain.handle("get-platform", () => process.platform);
  ipcMain.handle("get-version", () => app.getVersion());
  ipcMain.on("get-version-sync", (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle("set-server-url", (_event, url: string) => {
    const { writeFileSync, mkdirSync } = require("fs") as typeof import("fs");
    const userDataPath = app.getPath("userData");
    mkdirSync(userDataPath, { recursive: true });
    writeFileSync(join(userDataPath, "server-url.txt"), url, "utf-8");
  });

  ipcMain.handle("show-notification", (_event, payload: { title: string; body: string; url?: string }) => {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title: payload.title,
        body: payload.body,
        icon: getIconPath(),
      });
      notif.on("click", () => {
        mainWindow?.show();
        if (payload.url) {
          mainWindow?.webContents.send("navigate", payload.url);
        }
      });
      notif.show();
    }
    if (mainWindow && !mainWindow.isFocused()) {
      mainWindow.flashFrame(true);
    }
  });

  ipcMain.handle("set-tray-unread", (_event, count: number) => {
    if (tray) {
      tray.setToolTip(count > 0 ? `Jablu (${count} unread)` : "Jablu");
    }
  });

  ipcMain.handle("check-for-updates", () => {
    void checkForUpdates();
  });

  ipcMain.handle("install-update", () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

// ─── Auto Updater ────────────────────────────────────────────

function getStoredServerUrl(): string | null {
  try {
    const userDataPath = app.getPath("userData");
    const configPath = join(userDataPath, "server-url.txt");
    if (existsSync(configPath)) {
      return readFileSync(configPath, "utf-8").trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  const serverUrl = getStoredServerUrl();
  if (serverUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: `${serverUrl}/api/updates`,
    });
  }

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    mainWindow?.webContents.send("update-available", {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on("update-not-available", () => {
    mainWindow?.webContents.send("update-not-available");
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-download-progress", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    mainWindow?.webContents.send("update-downloaded", {
      version: info.version,
    });
  });

  autoUpdater.on("error", (err) => {
    mainWindow?.webContents.send("update-error", {
      message: err?.message ?? "Update check failed",
    });
  });

  setTimeout(() => void checkForUpdates(), 5000);
  setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000);
}

async function checkForUpdates() {
  const serverUrl = getStoredServerUrl();
  if (!serverUrl) return;

  autoUpdater.setFeedURL({
    provider: "generic",
    url: `${serverUrl}/api/updates`,
  });

  try {
    await autoUpdater.checkForUpdates();
  } catch {
    // silently ignore
  }
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();
  setupAutoUpdater();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
  }
});
