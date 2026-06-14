/**
 * letter-server/src/routes/labels.js
 * GET    /api/labels
 * POST   /api/labels
 * PATCH  /api/labels/:id
 * DELETE /api/labels/:id
 */

const express  = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb }      = require("../db");
const { requireAuth }= require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const db     = getDb();
  const labels = db.prepare(
    "SELECT * FROM labels WHERE user_id = ? ORDER BY created_at ASC"
  ).all(req.user.id);
  res.json({ labels });
});

router.post("/", (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const db = getDb();
  const id = uuidv4();
  db.prepare(
    "INSERT INTO labels (id, user_id, name, color) VALUES (?, ?, ?, ?)"
  ).run(id, req.user.id, name.trim(), color || "#b8d4f8");

  const label = db.prepare("SELECT * FROM labels WHERE id = ?").get(id);
  res.status(201).json({ label });
});

router.patch("/:id", (req, res) => {
  const db    = getDb();
  const label = db.prepare(
    "SELECT * FROM labels WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  const { name, color } = req.body;
  const updates = [], params = [];
  if (name  !== undefined) { updates.push("name = ?");  params.push(name.trim()); }
  if (color !== undefined) { updates.push("color = ?"); params.push(color); }
  if (!updates.length) return res.json({ label });

  params.push(label.id);
  db.prepare(`UPDATE labels SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM labels WHERE id = ?").get(label.id);
  res.json({ label: updated });
});

router.delete("/:id", (req, res) => {
  const db    = getDb();
  const label = db.prepare(
    "SELECT * FROM labels WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);
  if (!label) return res.status(404).json({ error: "Label not found" });

  db.prepare("DELETE FROM labels WHERE id = ?").run(label.id);
  res.json({ ok: true, id: label.id });
});

module.exports = router;
