/**
 * server/src/routes/oauth.js
 * OAuth2 flow for Gmail (Google) and Outlook/Hotmail (Microsoft).
 *
 * GET  /api/oauth/start          — begin OAuth flow; returns { url, state }
 * GET  /api/oauth/callback       — browser redirect target; exchanges code for tokens
 * GET  /api/oauth/status/:state  — poll for completion; returns { done, error }
 */

const express      = require("express");
const https        = require("https");
const { randomBytes } = require("crypto");
const { getDb }    = require("../db");
const { requireAuth } = require("../middleware/auth");
const { encrypt, decrypt } = require("../utils/crypto");

const router = express.Router();

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || "http://localhost:3001/api/oauth/callback";

// ── Provider configs ──────────────────────────────────────────────────────────

const PROVIDERS = {
  gmail: {
    authUrl:      "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl:     "https://oauth2.googleapis.com/token",
    scope:        "https://mail.google.com/",
    clientId:     () => process.env.GOOGLE_CLIENT_ID     || "",
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET || "",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  outlook: {
    authUrl:      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl:     "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope:        "https://outlook.office365.com/IMAP.AccessAsUser.All https://outlook.office365.com/SMTP.Send offline_access",
    clientId:     () => process.env.MICROSOFT_CLIENT_ID     || "",
    clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET || "",
    extraAuthParams: { response_mode: "query" },
  },
};

function getProvider(key) { return PROVIDERS[key] || null; }

// ── GET /api/oauth/start ──────────────────────────────────────────────────────
router.get("/start", requireAuth, (req, res) => {
  const { provider: provKey, accountId } = req.query;
  const prov = getProvider(provKey);

  if (!prov) {
    return res.status(400).json({ error: "Unknown provider. Use 'gmail' or 'outlook'." });
  }
  if (!prov.clientId()) {
    const envPrefix = provKey === "gmail" ? "GOOGLE" : "MICROSOFT";
    return res.status(500).json({
      error: `${provKey} OAuth is not configured. Add ${envPrefix}_CLIENT_ID and ${envPrefix}_CLIENT_SECRET to your server .env file.`,
    });
  }

  const db = getDb();
  const account = db.prepare(
    "SELECT * FROM email_accounts WHERE id = ? AND user_id = ?"
  ).get(accountId, req.user.id);
  if (!account) return res.status(404).json({ error: "Account not found" });

  // Generate a random state token to link the callback back to this request
  const state = randomBytes(24).toString("hex");
  db.prepare(`
    INSERT INTO oauth_pending (state, account_id, user_id, provider, created_at)
    VALUES (?, ?, ?, ?, unixepoch())
  `).run(state, accountId, req.user.id, provKey);

  const params = new URLSearchParams({
    client_id:     prov.clientId(),
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         prov.scope,
    state,
    ...prov.extraAuthParams,
  });

  res.json({ url: `${prov.authUrl}?${params}`, state });
});

// ── GET /api/oauth/callback (no auth — browser redirect) ─────────────────────
router.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    const msg = error_description || error;
    const db = getDb();
    if (state) db.prepare("UPDATE oauth_pending SET error = ? WHERE state = ?").run(msg, state);
    return res.send(closingPage("❌ Authentication cancelled", msg));
  }
  if (!code || !state) {
    return res.status(400).send("Missing code or state.");
  }

  const db = getDb();
  const pending = db.prepare("SELECT * FROM oauth_pending WHERE state = ?").get(state);
  if (!pending) {
    return res.status(400).send("Invalid or expired state. Please start the sign-in again.");
  }

  const prov = getProvider(pending.provider);
  try {
    const tokens = await exchangeCode(prov, code);

    // Store tokens encrypted
    db.prepare(`
      INSERT INTO oauth_tokens
        (account_id, provider, access_token_enc, refresh_token_enc, expires_at, scope, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch())
      ON CONFLICT(account_id, provider) DO UPDATE SET
        access_token_enc  = excluded.access_token_enc,
        refresh_token_enc = CASE WHEN excluded.refresh_token_enc != '' THEN excluded.refresh_token_enc ELSE oauth_tokens.refresh_token_enc END,
        expires_at        = excluded.expires_at,
        scope             = excluded.scope,
        updated_at        = unixepoch()
    `).run(
      pending.account_id,
      pending.provider,
      encrypt(tokens.access_token),
      tokens.refresh_token ? encrypt(tokens.refresh_token) : "",
      Date.now() + (tokens.expires_in || 3600) * 1000,
      tokens.scope || prov.scope,
    );

    // Mark account as connected
    db.prepare(
      "UPDATE email_accounts SET connected = 1, provider = ?, updated_at = unixepoch() WHERE id = ?"
    ).run(pending.provider, pending.account_id);

    // Mark the pending flow as done
    db.prepare("UPDATE oauth_pending SET done = 1 WHERE state = ?").run(state);

    res.send(closingPage("✅ Account Connected!", "You can close this window and return to Letter."));
  } catch (err) {
    db.prepare("UPDATE oauth_pending SET error = ? WHERE state = ?").run(err.message, state);
    res.send(closingPage("❌ Connection Failed", `${err.message} — close this window and try again.`));
  }
});

// ── GET /api/oauth/status/:state ──────────────────────────────────────────────
router.get("/status/:state", requireAuth, (req, res) => {
  const db = getDb();
  const pending = db.prepare(
    "SELECT * FROM oauth_pending WHERE state = ? AND user_id = ?"
  ).get(req.params.state, req.user.id);

  if (!pending) return res.status(404).json({ error: "State not found" });
  if (pending.error) return res.json({ done: false, error: pending.error });
  if (pending.done) {
    db.prepare("DELETE FROM oauth_pending WHERE state = ?").run(req.params.state);
    return res.json({ done: true });
  }
  res.json({ done: false });
});

// ── Token refresh helpers (exported for imap.js / smtp.js) ───────────────────

/**
 * Exchange an authorization code for access + refresh tokens.
 */
async function exchangeCode(prov, code) {
  const body = new URLSearchParams({
    code,
    client_id:     prov.clientId(),
    client_secret: prov.clientSecret(),
    redirect_uri:  REDIRECT_URI,
    grant_type:    "authorization_code",
  }).toString();
  return postJson(prov.tokenUrl, body);
}

/**
 * Use the stored refresh token to get a new access token.
 */
async function refreshOAuthToken(accountId, provider, db) {
  const row = db.prepare(
    "SELECT * FROM oauth_tokens WHERE account_id = ? AND provider = ?"
  ).get(accountId, provider);
  if (!row)                    throw new Error("No OAuth tokens for this account");
  if (!row.refresh_token_enc)  throw new Error("No refresh token — please reconnect your account via OAuth");

  const prov = getProvider(provider);
  const refreshToken = decrypt(row.refresh_token_enc);

  const body = new URLSearchParams({
    client_id:     prov.clientId(),
    client_secret: prov.clientSecret(),
    refresh_token: refreshToken,
    grant_type:    "refresh_token",
  }).toString();

  const tokens = await postJson(prov.tokenUrl, body);

  db.prepare(`
    UPDATE oauth_tokens
    SET access_token_enc = ?, expires_at = ?, updated_at = unixepoch()
    WHERE account_id = ? AND provider = ?
  `).run(
    encrypt(tokens.access_token),
    Date.now() + (tokens.expires_in || 3600) * 1000,
    accountId,
    provider,
  );

  return tokens.access_token;
}

/**
 * Return a valid (non-expired) access token, refreshing automatically if needed.
 */
async function getValidAccessToken(accountId, provider, db) {
  const row = db.prepare(
    "SELECT * FROM oauth_tokens WHERE account_id = ? AND provider = ?"
  ).get(accountId, provider);
  if (!row) return null; // no OAuth token — caller falls back to password auth

  // Refresh if expiring within 5 minutes
  if (row.expires_at - Date.now() < 5 * 60 * 1000) {
    return refreshOAuthToken(accountId, provider, db);
  }
  return decrypt(row.access_token_enc);
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
function postJson(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path:     u.pathname + u.search,
        method:   "POST",
        headers: {
          "Content-Type":   "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error_description || json.error));
            resolve(json);
          } catch {
            reject(new Error("Invalid token response from server"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── HTML helper ──────────────────────────────────────────────────────────────
function closingPage(title, message) {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <style>
      body { font-family: system-ui, sans-serif; display: flex; align-items: center;
             justify-content: center; height: 100vh; margin: 0; background: #f8f8f8; }
      .card { text-align: center; padding: 48px 40px; background: white;
              border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); max-width: 420px; }
      h2 { font-size: 22px; margin: 0 0 12px; }
      p  { color: #666; font-size: 14px; line-height: 1.6; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>${title}</h2>
      <p>${message}</p>
    </div>
    <script>
      // Auto-close after a short delay if opened as a popup
      setTimeout(() => { try { window.close(); } catch {} }, 3000);
    </script>
  </body>
</html>`;
}

module.exports = router;
module.exports.getValidAccessToken = getValidAccessToken;
module.exports.refreshOAuthToken   = refreshOAuthToken;
