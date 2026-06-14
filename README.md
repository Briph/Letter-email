# Letter — Desktop Email Client

A unified multi-account email client built with React + Electron.

---

## Requirements

- **Node.js** 18 or later — https://nodejs.org
- **npm** 9 or later (comes with Node)

---

## Getting started (development)

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode (React + Electron together)
npm run electron-dev
```

This opens the app window with DevTools enabled.  
Changes to `src/App.jsx` hot-reload automatically.

---

## Build an installable app

### macOS (.dmg — Intel + Apple Silicon)
```bash
npm run dist:mac
```
Output: `dist/Letter-1.0.0.dmg`

Double-click the DMG → drag **Letter** to Applications → launch.  
> First launch: right-click → Open to bypass Gatekeeper (app is unsigned).

### Windows (.exe installer)
```bash
npm run dist:win
```
Output: `dist/Letter Setup 1.0.0.exe`

Run the installer — creates Start Menu and Desktop shortcuts.

### Linux (.AppImage + .deb)
```bash
npm run dist:linux
```
```bash
chmod +x Letter-*.AppImage && ./Letter-*.AppImage
# or
sudo dpkg -i letter_*.deb
```

---

## ✦ Auto-update system (GitHub Releases)

Letter uses `electron-updater` to check your GitHub repository for new releases.  
When a new version is published, users see a banner in the app and can  
download + install with one click — no manual reinstall needed.

### Step 1 — Create a GitHub repository

1. Go to https://github.com/new
2. Create a **public** repository (e.g. `letter-email`)
3. Note your username and repo name

### Step 2 — Configure package.json

Open `package.json` and update the `publish` block:

```json
"publish": {
  "provider": "github",
  "owner":    "your-github-username",
  "repo":     "letter-email",
  "releaseType": "release"
}
```

### Step 3 — Create a GitHub Personal Access Token

Letter's build system needs write access to create releases.

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Name it `Letter releases`
4. Check **`repo`** scope (full repo access)
5. Click **Generate token** — copy it immediately

Set it as an environment variable before building:

```bash
# macOS / Linux
export GH_TOKEN=ghp_your_token_here

# Windows (PowerShell)
$env:GH_TOKEN="ghp_your_token_here"
```

### Step 4 — Bump the version and publish a release

Every release needs a higher version number. Edit `package.json`:

```json
"version": "1.1.0"
```

Then build and publish in one command:

```bash
# Publish for your current platform
npm run dist:mac    # adds --publish always automatically via GH_TOKEN
npm run dist:win
npm run dist:linux

# Or release all platforms at once (requires cross-compilation setup)
npm run release
```

This will:
- Build the app
- Create a GitHub Release tagged `v1.1.0`
- Upload the installer files (`.dmg`, `.exe`, `.AppImage`, `.deb`)
- Upload a `latest.yml` / `latest-mac.yml` manifest that `electron-updater` reads

### Step 5 — Push your code

```bash
git init
git remote add origin https://github.com/your-username/letter-email.git
git add .
git commit -m "Initial release"
git push -u origin main
```

### How updates work for your users

1. User opens Letter
2. After 5 seconds, Letter silently checks `https://github.com/you/letter-email/releases/latest`
3. If `version` in the manifest is higher than the installed version:
   - A **banner appears** below the topbar: *"Letter 1.1.0 is available"*
   - User clicks **Download Update** — progress bar shows download
   - When done: **Restart & Install** button appears
   - App quits, installs the new version, reopens automatically
4. Letter also checks every **4 hours** while running
5. Users can manually trigger a check from **Settings → General → Check Now**  
   or from the menu (**Letter → Check for Updates…** / **File → Check for Updates…**)

### Update check URL (what electron-updater fetches)

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/latest.yml
```

No server needed — GitHub Releases hosts everything.

---

## Project structure

```
letter-app/
├── electron/
│   ├── main.js        — Electron main process (window, menu, IPC)
│   ├── preload.js     — Secure IPC bridge to renderer
│   └── updater.js     — Auto-update logic (electron-updater)
├── public/
│   └── index.html     — HTML template
├── src/
│   ├── index.js       — React entry point
│   ├── App.jsx        — Full email client UI + settings
│   └── UpdateBanner.jsx — Update notification banner
├── package.json       — Scripts, deps, electron-builder + publish config
└── README.md
```

---

## Features

- **Multiple email accounts** — unlimited, colour-coded
- **Unified inbox** — all accounts together or filtered
- **Thread view** — collapsible conversation history
- **Labels** — custom colour-coded tags
- **Snooze** — hide until a chosen time
- **Send Later** — schedule future sends
- **Undo Send** — configurable 5–30s recall window
- **Rich text compose** — bold, italic, underline, lists, quotes
- **Signatures** — per-account, auto-appended
- **Draft autosave** — saves after 2s of inactivity
- **Contact autocomplete** — suggests known addresses
- **Attachments UI** — chips with name and size
- **Print** — clean print view
- **Bulk actions** — archive, delete, mark unread
- **Keyboard shortcuts** — C R F E # U H Esc
- **Dark mode** — full theme, persisted
- **Desktop notifications** — native OS alerts
- **Auto-update** — GitHub Releases, one-click install
- **Persistent settings** — saved to disk via electron-store

## Settings tabs

| Tab | Controls |
|-----|----------|
| Accounts | Add/remove, signatures, set default |
| Labels | Create/remove colour-coded labels |
| Reading | Pane position, density, font size, preview lines, sender display, sort order, thread grouping, auto-mark-read delay |
| Composing | Undo send window, default reply, confirm-before-delete |
| Notifications | Toggle desktop notifications |
| Shortcuts | Enable/disable, reference card |
| General | Dark mode, default account, **auto-update toggle**, **Check Now** button |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `C` / `⌘N` | Compose |
| `R` | Reply |
| `F` | Forward |
| `E` | Archive |
| `#` | Delete |
| `U` | Mark unread |
| `H` | Snooze |
| `Esc` | Close / dismiss |
