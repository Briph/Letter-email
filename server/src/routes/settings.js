/**
 * letter-server/src/routes/settings.js
 * GET   /api/settings   — fetch user's app settings
 * PUT   /api/settings   — replace entire settings blob
 * PATCH /api/settings   — merge partial settings
 */

const express        = require("express");
const { getDb }      = require("../db");
const { requireAuth }= require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const db  = getDb();
  const row = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(req.user.id);
  if (!row) return res.json({ settings: {} });
  try {
    res.json({ settings: JSON.parse(row.settings) });
  } catch {
    res.json({ settings: {} });
  }
});

router.put("/", (req, res) => {
  const { settings } = req.body;
  if (typeof settings !== "object" || settings === null) {
    return res.status(400).json({ error: "settings must be an object" });
  }
  const db   = getDb();
  const json = JSON.stringify(settings);
  db.prepare(`
    INSERT INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = unixepoch()
  `).run(req.user.id, json);
  res.json({ settings });
});

router.patch("/", (req, res) => {
  const { settings: patch } = req.body;
  if (typeof patch !== "object" || patch === null) {
    return res.status(400).json({ error: "settings must be an object" });
  }
  const db  = getDb();
  const row = db.prepare("SELECT settings FROM user_settings WHERE user_id = ?").get(req.user.id);
  const current = row ? JSON.parse(row.settings) : {};
  const merged  = { ...current, ...patch };
  const json    = JSON.stringify(merged);
  db.prepare(`
    INSERT INTO user_settings (user_id, settings, updated_at) VALUES (?, ?, unixepoch())
    ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = unixepoch()
  `).run(req.user.id, json);
  res.json({ settings: merged });
});

module.exports = router;
