const { app, BrowserWindow, ipcMain, Notification, nativeTheme, Menu, shell } = require("electron");
const path   = require("path");
const fs     = require("fs");
const { spawn } = require("child_process");
const Store  = require("electron-store");
const { initUpdater, stopUpdater } = require("./updater");

// ─── Persistent settings store ───────────────────────────────────────────────
const store = new Store({
  defaults: {
    windowBounds: { width: 1280, height: 800 },
    settings: {
      dark:               false,
      density:            "comfortable",
      readingPane:        "right",
      undoSendWindow:     5,
      autoMarkReadDelay:  0,
      senderDisplay:      "both",
      threadGrouping:     true,
      previewLines:       2,
      sortOrder:          "newest",
      notifications:      true,
      confirmDelete:      false,
      shortcuts:          true,
      defaultReply:       "reply",
      fontSize:           "medium",
      autoUpdate:         true,   // check for updates automatically
    },
  },
});

let mainWindow;
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

// ─── Backend server ───────────────────────────────────────────────────────────
let serverProcess = null;

function startServer() {
  const serverEntry = isDev
    ? path.join(__dirname, "../server/src/index.js")
    : path.join(process.resourcesPath, "server/src/index.js");

  if (!fs.existsSync(serverEntry)) {
    console.error("[main] Server entry not found:", serverEntry);
    return;
  }

  // In production, generate stable secrets derived from the machine's app data path
  // so they survive restarts but are unique per installation.
  const dataDir = app.getPath("userData");
  const secretsFile = path.join(dataDir, "secrets.json");
  let secrets;
  if (fs.existsSync(secretsFile)) {
    secrets = JSON.parse(fs.readFileSync(secretsFile, "utf8"));
  } else {
    const crypto = require("crypto");
    secrets = {
      JWT_SECRET:          crypto.randomBytes(64).toString("hex"),
      JWT_REFRESH_SECRET:  crypto.randomBytes(64).toString("hex"),
      CREDENTIALS_SECRET:  crypto.randomBytes(32).toString("hex"),
    };
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(secrets));
  }

  const env = {
    ...process.env,
    NODE_ENV:              isDev ? "development" : "production",
    PORT:                  "3001",
    DB_PATH:               path.join(dataDir, "letter.db"),
    JWT_SECRET:            secrets.JWT_SECRET,
    JWT_REFRESH_SECRET:    secrets.JWT_REFRESH_SECRET,
    CREDENTIALS_SECRET:    secrets.CREDENTIALS_SECRET,
    JWT_EXPIRES_IN:        "15m",
    JWT_REFRESH_EXPIRES_IN:"30d",
    CORS_ORIGINS:          "http://localhost:3000,file://",
  };

  serverProcess = spawn(process.execPath, [serverEntry], {
    env,
    stdio: isDev ? "inherit" : "ignore",
  });

  serverProcess.on("error", (err) => console.error("[server]", err.message));
  serverProcess.on("exit",  (code) => { if (code !== 0) console.warn("[server] exited with code", code); });
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const { width, height } = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth:      900,
    minHeight:     600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    frame:         process.platform !== "darwin",
    backgroundColor: "#111111",
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    ...(fs.existsSync(path.join(__dirname, "../public/icon.png"))
      ? { icon: path.join(__dirname, "../public/icon.png") }
      : {}),
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../build/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // Start updater after window is visible
    const settings = store.get("settings");
    if (settings.autoUpdate !== false) {
      initUpdater(mainWindow);
    }
  });

  mainWindow.on("resize", () => {
    const [w, h] = mainWindow.getSize();
    store.set("windowBounds", { width: w, height: h });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    stopUpdater();
    mainWindow = null;
  });

  buildMenu();
}

// ─── App menu ─────────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Check for Updates…",
        click: () => {
          mainWindow?.webContents.send("shortcut", "check-update");
        },
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ]}] : []),
    { label: "File", submenu: [
      { label: "New Message", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.webContents.send("shortcut", "compose") },
      { type: "separator" },
      ...(!isMac ? [{ label: "Check for Updates…", click: () => mainWindow?.webContents.send("shortcut", "check-update") }, { type: "separator" }] : []),
      isMac ? { role: "close" } : { role: "quit" },
    ]},
    { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" },
      { role: "selectAll" },
    ]},
    { label: "View", submenu: [
      { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+\\", click: () => mainWindow?.webContents.send("shortcut", "sidebar") },
      { type: "separator" },
      { role: "reload" }, { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ]},
    { label: "Window", submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(isMac ? [{ type: "separator" }, { role: "front" }] : []),
    ]},
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC: settings ───────────────────────────────────────────────────────────
ipcMain.handle("settings:get",   ()          => store.get("settings"));
ipcMain.handle("settings:set",   (_, s)      => { store.set("settings", s); return true; });
ipcMain.handle("settings:reset", ()          => { store.reset("settings"); return store.get("settings"); });

// ─── IPC: notifications ───────────────────────────────────────────────────────
ipcMain.handle("notify", (_, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show();
  }
});

// ─── IPC: theme ──────────────────────────────────────────────────────────────
ipcMain.handle("theme:native", () => nativeTheme.shouldUseDarkColors);

// ─── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) { serverProcess.kill(); serverProcess = null; }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
