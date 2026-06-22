/**
 * Letter auto-updater
 * Uses electron-updater to check GitHub Releases for new versions.
 *
 * Setup: set GITHUB_OWNER and GITHUB_REPO below (or keep placeholders and
 * fill them in before building).  Then push a release to GitHub — see README.
 */

const { autoUpdater } = require("electron-updater");
const { ipcMain, dialog, app }  = require("electron");
const log = require("electron-log");

// ─── Configure logging ────────────────────────────────────────────────────────
autoUpdater.logger         = log;
autoUpdater.logger.transports.file.level = "info";

// ─── Disable auto-download so we can show a prompt first ─────────────────────
autoUpdater.autoDownload        = false;
autoUpdater.autoInstallOnAppQuit = true;   // install silently on next quit

let _mainWindow = null;
let _checkInterval = null;

// Send a message to the renderer (safe — window might not be ready yet)
function send(channel, payload) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send(channel, payload);
  }
}

// ─── Updater events ───────────────────────────────────────────────────────────
autoUpdater.on("checking-for-update", () => {
  log.info("[updater] Checking for update…");
  send("updater:status", { type: "checking" });
});

autoUpdater.on("update-available", (info) => {
  log.info("[updater] Update available:", info.version);
  send("updater:status", {
    type:    "available",
    version: info.version,
    notes:   info.releaseNotes || "",
    date:    info.releaseDate  || "",
  });
});

autoUpdater.on("update-not-available", (info) => {
  log.info("[updater] Up to date:", info.version);
  send("updater:status", { type: "up-to-date", version: info.version });
});

autoUpdater.on("download-progress", (progress) => {
  const pct = Math.round(progress.percent);
  log.info(`[updater] Downloading… ${pct}%`);
  send("updater:status", {
    type:    "downloading",
    percent: pct,
    speed:   Math.round(progress.bytesPerSecond / 1024), // KB/s
  });
});

autoUpdater.on("update-downloaded", (info) => {
  log.info("[updater] Download complete:", info.version);
  send("updater:status", { type: "downloaded", version: info.version });
});

autoUpdater.on("error", (err) => {
  log.error("[updater] Error:", err.message);
  // Silence expected non-fatal errors so the UI doesn't show a scary error
  const msg = (err.message || "").toLowerCase();
  const silent =
    msg.includes("net::")             ||  // network unavailable
    msg.includes("enotfound")         ||  // DNS failure / offline
    msg.includes("econnrefused")      ||  // no connection
    msg.includes("404")               ||  // no releases published yet
    msg.includes("no published")      ||  // "No published versions on GitHub"
    msg.includes("latest.yml")        ||  // release exists but missing metadata
    msg.includes("github")            ;   // catch-all for any other GitHub API errors
  send("updater:status", {
    type:    "error",
    message: silent ? null : err.message,
  });
});

// ─── IPC handlers (called from renderer via preload) ─────────────────────────

/** Manually trigger an update check */
ipcMain.handle("updater:check", async () => {
  if (!app.isPackaged) {
    log.info("[updater] Dev mode — skipping manual check.");
    return;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (e) {
    log.warn("[updater] checkForUpdates threw:", e.message);
  }
});

/** Start downloading the available update */
ipcMain.handle("updater:download", async () => {
  try {
    await autoUpdater.downloadUpdate();
  } catch (e) {
    log.error("[updater] downloadUpdate threw:", e.message);
    send("updater:status", { type: "error", message: e.message });
  }
});

/** Quit and install immediately */
ipcMain.handle("updater:install", () => {
  autoUpdater.quitAndInstall(false, true);
});

/** Dismiss — store the skipped version so we don't nag again this session */
ipcMain.handle("updater:dismiss", (_, version) => {
  send("updater:dismissed", version);
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call this from main.js after the window is created.
 * @param {BrowserWindow} win
 */
function initUpdater(win) {
  _mainWindow = win;

  // Skip in dev — no packaged app = no update feed
  if (!app.isPackaged) {
    log.info("[updater] Dev mode — skipping auto-update checks.");
    return;
  }

  // Check on startup (after a 5s delay so the window has time to render)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(e =>
      log.warn("[updater] Startup check failed:", e.message)
    );
  }, 5000);

  // Check every 4 hours while the app is open
  _checkInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(e =>
      log.warn("[updater] Periodic check failed:", e.message)
    );
  }, 4 * 60 * 60 * 1000);
}

function stopUpdater() {
  if (_checkInterval) clearInterval(_checkInterval);
}

module.exports = { initUpdater, stopUpdater };
