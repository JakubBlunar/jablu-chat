import { app, BrowserWindow, desktopCapturer, ipcMain, Tray, Menu, nativeImage, session } from "electron";
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
    title: "Nook",
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
  tray.setToolTip("Nook");

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
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  createTray();
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
