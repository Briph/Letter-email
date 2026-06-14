/**
 * letter-server/src/db/index.js
 * Returns a shared SQLite database connection.
 * Runs schema init on first import.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs   = require("fs");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "../../data/letter.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let _db;

function getDb() {
  if (_db) return _db;

  _db = new Database(path.resolve(DB_PATH));
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run schema (idempotent)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_login    INTEGER
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      revoked    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS email_accounts (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      color        TEXT NOT NULL DEFAULT '#aec6e8',
      is_default   INTEGER NOT NULL DEFAULT 0,
      signature    TEXT NOT NULL DEFAULT '',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      provider     TEXT NOT NULL DEFAULT 'manual',
      connected    INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS imap_credentials (
      account_id       TEXT PRIMARY KEY REFERENCES email_accounts(id) ON DELETE CASCADE,
      imap_host        TEXT NOT NULL,
      imap_port        INTEGER NOT NULL DEFAULT 993,
      imap_tls         INTEGER NOT NULL DEFAULT 1,
      imap_user        TEXT NOT NULL,
      imap_password_enc TEXT NOT NULL,
      sent_folder      TEXT NOT NULL DEFAULT 'Sent',
      drafts_folder    TEXT NOT NULL DEFAULT 'Drafts',
      trash_folder     TEXT NOT NULL DEFAULT 'Trash',
      spam_folder      TEXT NOT NULL DEFAULT 'Spam',
      last_synced      INTEGER
    );
    CREATE TABLE IF NOT EXISTS smtp_credentials (
      account_id        TEXT PRIMARY KEY REFERENCES email_accounts(id) ON DELETE CASCADE,
      smtp_host         TEXT NOT NULL,
      smtp_port         INTEGER NOT NULL DEFAULT 587,
      smtp_secure       INTEGER NOT NULL DEFAULT 0,
      smtp_user         TEXT NOT NULL,
      smtp_password_enc TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      account_id       TEXT NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
      folder           TEXT NOT NULL DEFAULT 'Inbox',
      message_id       TEXT NOT NULL,
      from_name        TEXT NOT NULL DEFAULT '',
      from_email       TEXT NOT NULL DEFAULT '',
      to_addr          TEXT NOT NULL DEFAULT '',
      cc_addr          TEXT NOT NULL DEFAULT '',
      subject          TEXT NOT NULL DEFAULT '',
      preview          TEXT NOT NULL DEFAULT '',
      body             TEXT NOT NULL DEFAULT '',
      body_html        TEXT NOT NULL DEFAULT '',
      date_sent        TEXT NOT NULL,
      is_unread        INTEGER NOT NULL DEFAULT 1,
      is_starred       INTEGER NOT NULL DEFAULT 0,
      has_attachment   INTEGER NOT NULL DEFAULT 0,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      uid              INTEGER,
      imap_mailbox     TEXT,
      labels_json      TEXT NOT NULL DEFAULT '[]',
      thread_id        TEXT,
      in_reply_to      TEXT,
      references_header TEXT,
      unsubscribe_url  TEXT,
      synced_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(account_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS labels (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#b8d4f8',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS user_settings (
      user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      settings   TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_rt_user       ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_ea_user       ON email_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_lbl_user      ON labels(user_id);
    CREATE INDEX IF NOT EXISTS idx_msg_account   ON messages(account_id);
    CREATE INDEX IF NOT EXISTS idx_msg_folder    ON messages(account_id, folder);
    CREATE INDEX IF NOT EXISTS idx_msg_date      ON messages(date_sent DESC);
    CREATE INDEX IF NOT EXISTS idx_msg_thread    ON messages(thread_id);
  `);

  return _db;
}

module.exports = { getDb };
