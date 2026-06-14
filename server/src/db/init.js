/**
 * letter-server/src/db/init.js
 * Creates the SQLite database and all tables.
 * Run once: node src/db/init.js
 * Safe to re-run — uses IF NOT EXISTS.
 */

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const DB_PATH = process.env.DB_PATH || "./data/letter.db";

// Ensure data directory exists
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- ── Users ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,           -- UUID
    email        TEXT UNIQUE NOT NULL,       -- login email (for Letter account)
    display_name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login   INTEGER
  );

  -- ── Refresh tokens ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    revoked    INTEGER NOT NULL DEFAULT 0    -- boolean 0/1
  );

  -- ── Email accounts (per user) ───────────────────────────────────────────
  -- Stores the display config for each inbox.
  -- Actual IMAP/SMTP credentials are stored encrypted in a separate column.
  CREATE TABLE IF NOT EXISTS email_accounts (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,              -- display name e.g. "Work"
    email        TEXT NOT NULL,              -- the inbox address
    color        TEXT NOT NULL DEFAULT '#aec6e8',
    is_default   INTEGER NOT NULL DEFAULT 0, -- boolean
    signature    TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Labels (per user) ───────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS labels (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    color     TEXT NOT NULL DEFAULT '#b8d4f8',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── User settings (per user, JSON blob) ─────────────────────────────────
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings   TEXT NOT NULL DEFAULT '{}',   -- JSON
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- ── Indexes ──────────────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user  ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_accounts_user  ON email_accounts(user_id);
  CREATE INDEX IF NOT EXISTS idx_labels_user          ON labels(user_id);
`);

console.log("✓ Database initialised at", path.resolve(DB_PATH));

module.exports = db;
