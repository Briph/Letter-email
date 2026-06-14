const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ── Settings ────────────────────────────────────────────────────────────
  getSettings:   ()    => ipcRenderer.invoke("settings:get"),
  saveSettings:  (s)   => ipcRenderer.invoke("settings:set", s),
  resetSettings: ()    => ipcRenderer.invoke("settings:reset"),

  // ── Notifications ────────────────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.invoke("notify", { title, body }),

  // ── Native dark mode ─────────────────────────────────────────────────────
  getNativeTheme: () => ipcRenderer.invoke("theme:native"),

  // ── Menu / keyboard shortcuts ────────────────────────────────────────────
  onShortcut: (cb) => {
    const handler = (_, key) => cb(key);
    ipcRenderer.on("shortcut", handler);
    return () => ipcRenderer.removeListener("shortcut", handler);
  },

  // ── Auto-updater ─────────────────────────────────────────────────────────
  /** Ask the main process to check for updates right now */
  updaterCheck:    ()        => ipcRenderer.invoke("updater:check"),
  /** Start downloading a confirmed available update */
  updaterDownload: ()        => ipcRenderer.invoke("updater:download"),
  /** Quit and install the downloaded update */
  updaterInstall:  ()        => ipcRenderer.invoke("updater:install"),
  /** Dismiss the banner for this version */
  updaterDismiss:  (version) => ipcRenderer.invoke("updater:dismiss", version),

  /**
   * Subscribe to updater status events pushed from the main process.
   * Status objects: { type: "checking"|"available"|"downloading"|
   *                         "downloaded"|"up-to-date"|"error", ...extras }
   * Returns an unsubscribe function.
   */
  onUpdaterStatus: (cb) => {
    const handler = (_, status) => cb(status);
    ipcRenderer.on("updater:status", handler);
    return () => ipcRenderer.removeListener("updater:status", handler);
  },

  // ── Platform info ────────────────────────────────────────────────────────
  platform:   process.platform,
  appVersion: process.env.npm_package_version || "1.0.0",
  isElectron: true,
});
