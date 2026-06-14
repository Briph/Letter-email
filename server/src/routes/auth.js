/**
 * letter-server/src/routes/auth.js
 * POST /api/auth/signup
 * POST /api/auth/signin
 * POST /api/auth/refresh
 * POST /api/auth/signout
 * GET  /api/auth/me
 */

const express  = require("express");
const bcrypt   = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
const { getDb } = require("../db");
const { signAccess, signRefresh, verifyRefresh, hashToken, getExpiry } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const SALT_ROUNDS = 12;

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeTokenPair(userId, email) {
  const access  = signAccess({ sub: userId, email });
  const refresh = signRefresh({ sub: userId, email });
  return { access, refresh };
}

function storeRefreshToken(db, userId, refreshToken) {
  const id        = uuidv4();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = getExpiry(refreshToken);
  db.prepare(`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, tokenHash, expiresAt);
}

function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post("/signup", async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const db = getDb();

  try {
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userId       = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, display_name, password_hash)
      VALUES (?, ?, ?, ?)
    `).run(userId, email.toLowerCase(), displayName || email.split("@")[0], passwordHash);

    // Seed empty settings row
    db.prepare("INSERT INTO user_settings (user_id, settings) VALUES (?, ?)").run(userId, "{}");

    const { access, refresh } = makeTokenPair(userId, email.toLowerCase());
    storeRefreshToken(db, userId, refresh);

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

    res.status(201).json({
      user:         sanitizeUser(user),
      accessToken:  access,
      refreshToken: refresh,
    });
  } catch (err) {
    console.error("[auth/signup]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/signin ─────────────────────────────────────────────────────
router.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const db   = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  try {
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last_login
    db.prepare("UPDATE users SET last_login = unixepoch() WHERE id = ?").run(user.id);

    const { access, refresh } = makeTokenPair(user.id, user.email);
    storeRefreshToken(db, user.id, refresh);

    res.json({
      user:         sanitizeUser(user),
      accessToken:  access,
      refreshToken: refresh,
    });
  } catch (err) {
    console.error("[auth/signin]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken required" });
  }

  try {
    const payload   = verifyRefresh(refreshToken);
    const db        = getDb();
    const tokenHash = hashToken(refreshToken);

    const stored = db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE token_hash = ? AND revoked = 0 AND expires_at > unixepoch()
    `).get(tokenHash);

    if (!stored) {
      return res.status(401).json({ error: "Refresh token invalid or expired" });
    }

    // Rotate — revoke old, issue new
    db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE id = ?").run(stored.id);

    const { access, refresh: newRefresh } = makeTokenPair(payload.sub, payload.email);
    storeRefreshToken(db, payload.sub, newRefresh);

    res.json({ accessToken: access, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ── POST /api/auth/signout ────────────────────────────────────────────────────
// No requireAuth here — the access token may be expired at signout time.
// The refresh token itself is the credential for revoking the session.
router.post("/signout", (req, res) => {
  const { refreshToken, everywhere } = req.body;
  const db = getDb();

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    // Find the user from the stored token so we can revoke all if needed
    const stored = db.prepare("SELECT user_id FROM refresh_tokens WHERE token_hash = ?").get(tokenHash);
    db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?").run(tokenHash);

    if (everywhere && stored) {
      db.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?").run(stored.user_id);
    }
  }

  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get("/me", requireAuth, (req, res) => {
  const db   = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: sanitizeUser(user) });
});

// ── PATCH /api/auth/me ────────────────────────────────────────────────────────
router.patch("/me", requireAuth, async (req, res) => {
  const { displayName, currentPassword, newPassword } = req.body;
  const db   = getDb();
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  try {
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: "currentPassword required to change password" });
      }
      const valid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!valid) return res.status(401).json({ error: "Current password incorrect" });
      if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

      const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?").run(hash, user.id);
    }

    if (displayName !== undefined) {
      db.prepare("UPDATE users SET display_name = ?, updated_at = unixepoch() WHERE id = ?").run(displayName, user.id);
    }

    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    console.error("[auth/patch-me]", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
