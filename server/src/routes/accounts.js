/**
 * letter-server/src/routes/accounts.js
 * CRUD for a user's linked email accounts (inboxes).
 *
 * GET    /api/accounts         — list all
 * POST   /api/accounts         — add one
 * PATCH  /api/accounts/:id     — update (name, color, signature, isDefault)
 * DELETE /api/accounts/:id     — remove
 * POST   /api/accounts/:id/default — set as default
 */

const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb }      = require("../db");
const { requireAuth }= require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// ── GET /api/accounts ─────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const db       = getDb();
  const accounts = db.prepare(
    "SELECT * FROM email_accounts WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC"
  ).all(req.user.id);
  res.json({ accounts: accounts.map(dbToClient) });
});

// ── POST /api/accounts ────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { name, email, color, signature } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const db      = getDb();
  const id      = uuidv4();
  const userId  = req.user.id;

  // First account becomes default
  const count = db.prepare("SELECT COUNT(*) as n FROM email_accounts WHERE user_id = ?").get(userId).n;
  const isDefault = count === 0 ? 1 : 0;

  db.prepare(`
    INSERT INTO email_accounts (id, user_id, name, email, color, is_default, signature, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name.trim(), email.trim().toLowerCase(), color || "#aec6e8", isDefault, signature || "", count);

  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(id);
  res.status(201).json({ account: dbToClient(account) });
});

// ── PATCH /api/accounts/:id ───────────────────────────────────────────────────
router.patch("/:id", (req, res) => {
  const db      = getDb();
  const account = db.prepare(
    "SELECT * FROM email_accounts WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);

  if (!account) return res.status(404).json({ error: "Account not found" });

  const { name, color, signature, sortOrder } = req.body;
  const updates = [];
  const params  = [];

  if (name      !== undefined) { updates.push("name = ?");       params.push(name.trim()); }
  if (color     !== undefined) { updates.push("color = ?");      params.push(color); }
  if (signature !== undefined) { updates.push("signature = ?");  params.push(signature); }
  if (sortOrder !== undefined) { updates.push("sort_order = ?"); params.push(sortOrder); }

  if (updates.length === 0) return res.json({ account: dbToClient(account) });

  updates.push("updated_at = unixepoch()");
  params.push(account.id);

  db.prepare(`UPDATE email_accounts SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(account.id);
  res.json({ account: dbToClient(updated) });
});

// ── POST /api/accounts/:id/default ───────────────────────────────────────────
router.post("/:id/default", (req, res) => {
  const db     = getDb();
  const userId = req.user.id;

  const account = db.prepare(
    "SELECT * FROM email_accounts WHERE id = ? AND user_id = ?"
  ).get(req.params.id, userId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  // Unset all, then set this one
  db.prepare("UPDATE email_accounts SET is_default = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE email_accounts SET is_default = 1, updated_at = unixepoch() WHERE id = ?").run(account.id);

  const accounts = db.prepare(
    "SELECT * FROM email_accounts WHERE user_id = ? ORDER BY sort_order ASC"
  ).all(userId);
  res.json({ accounts: accounts.map(dbToClient) });
});

// ── DELETE /api/accounts/:id ──────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const db     = getDb();
  const userId = req.user.id;

  const account = db.prepare(
    "SELECT * FROM email_accounts WHERE id = ? AND user_id = ?"
  ).get(req.params.id, userId);
  if (!account) return res.status(404).json({ error: "Account not found" });

  db.prepare("DELETE FROM email_accounts WHERE id = ?").run(account.id);

  // If deleted account was default, promote the first remaining one
  if (account.is_default) {
    const first = db.prepare(
      "SELECT id FROM email_accounts WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1"
    ).get(userId);
    if (first) {
      db.prepare("UPDATE email_accounts SET is_default = 1 WHERE id = ?").run(first.id);
    }
  }

  res.json({ ok: true, id: account.id });
});

// ── DB → client shape ─────────────────────────────────────────────────────────
function dbToClient(row) {
  return {
    id:         row.id,
    name:       row.name,
    email:      row.email,
    color:      row.color,
    isDefault:  !!row.is_default,
    signature:  row.signature,
    sortOrder:  row.sort_order,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

module.exports = router;
