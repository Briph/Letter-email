/**
 * server/src/routes/connect.js
 *
 * POST /api/accounts/:id/connect      — save IMAP+SMTP creds and do initial sync
 * POST /api/accounts/:id/test         — test credentials without saving
 * POST /api/accounts/:id/sync         — trigger a manual sync
 * POST /api/accounts/:id/disconnect   — remove credentials, keep account display config
 * GET  /api/providers                 — list known provider presets (public)
 * GET  /api/messages                  — fetch all messages
 * PATCH /api/messages/:id             — update message flags (read/starred/folder)
 * POST /api/messages/send             — send a message via SMTP
 */

const express   = require("express");
const { v4: uuidv4 } = require("uuid");
const { getDb }      = require("../db");
const { encrypt, decrypt } = require("../utils/crypto");
const { testImapConnection, syncAccount } = require("../services/imap");
const { testSmtpConnection, sendFromAccount } = require("../services/smtp");
const { listProviders, detectProvider, getProvider } = require("../utils/providers");

const router = express.Router();

// ── GET /api/providers ────────────────────────────────────────────────────────
router.get("/providers", (req, res) => {
  res.json({ providers: listProviders() });
});

// ── POST /api/accounts/:id/test ───────────────────────────────────────────────
router.post("/accounts/:id/test", async (req, res) => {
  const { imap, smtp, email } = req.body;
  if (!imap || !smtp) return res.status(400).json({ error: "imap and smtp configs required" });

  const accountEmail = email || req.params.id;
  const results = { imapOk: false, smtpOk: false, imapError: null, smtpError: null };

  await Promise.all([
    testImapConnection({
      user:     imap.user || accountEmail,
      password: imap.password,
      host:     imap.host,
      port:     imap.port || 993,
      tls:      imap.tls !== false,
    }).then(() => { results.imapOk = true; })
      .catch(e => { results.imapError = e.message; }),

    testSmtpConnection({
      user:     smtp.user || accountEmail,
      password: smtp.password,
      host:     smtp.host,
      port:     smtp.port || 587,
      secure:   smtp.secure || false,
    }).then(() => { results.smtpOk = true; })
      .catch(e => { results.smtpError = e.message; }),
  ]);

  res.json(results);
});

// ── POST /api/accounts/:id/connect ───────────────────────────────────────────
router.post("/accounts/:id/connect", async (req, res) => {
  const accountId = req.params.id;
  const { imap, smtp, folderMap, email, name, color } = req.body;

  if (!imap?.password || !smtp?.password) {
    return res.status(400).json({ error: "imap.password and smtp.password are required" });
  }

  const db = getDb();

  // Upsert the account so credentials can be stored against it
  const accountEmail = email || accountId;
  const accountName  = name  || accountEmail.split("@")[0];
  db.prepare(`
    INSERT INTO email_accounts (id, user_id, name, email, color, provider, connected)
    VALUES (?, 'local', ?, ?, ?, 'manual', 0)
    ON CONFLICT(id) DO UPDATE SET
      name  = excluded.name,
      email = excluded.email
  `).run(accountId, accountName, accountEmail, color || "#aec6e8");

  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(accountId);

  const providerKey  = req.body.provider || detectProvider(account.email) || "manual";
  const providerConf = getProvider(providerKey);

  const imapConfig = {
    host: imap.host || providerConf?.imap.host,
    port: imap.port || providerConf?.imap.port || 993,
    tls:  imap.tls  ?? providerConf?.imap.tls ?? true,
    user: imap.user || account.email,
  };
  const smtpConfig = {
    host:   smtp.host   || providerConf?.smtp.host,
    port:   smtp.port   || providerConf?.smtp.port || 587,
    secure: smtp.secure ?? providerConf?.smtp.secure ?? false,
    user:   smtp.user   || account.email,
  };

  if (!imapConfig.host) return res.status(400).json({ error: "IMAP host is required" });
  if (!smtpConfig.host) return res.status(400).json({ error: "SMTP host is required" });

  // Test before saving
  try {
    await testImapConnection({ ...imapConfig, password: imap.password });
  } catch (err) {
    return res.status(422).json({ error: err.message, field: "imap" });
  }
  try {
    await testSmtpConnection({ ...smtpConfig, password: smtp.password });
  } catch (err) {
    return res.status(422).json({ error: err.message, field: "smtp" });
  }

  // Save encrypted credentials
  const imapEnc = encrypt(imap.password);
  const smtpEnc = encrypt(smtp.password);

  db.prepare(`
    INSERT INTO imap_credentials
      (account_id, imap_host, imap_port, imap_tls, imap_user, imap_password_enc,
       sent_folder, drafts_folder, trash_folder, spam_folder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      imap_host         = excluded.imap_host,
      imap_port         = excluded.imap_port,
      imap_tls          = excluded.imap_tls,
      imap_user         = excluded.imap_user,
      imap_password_enc = excluded.imap_password_enc,
      sent_folder       = excluded.sent_folder,
      drafts_folder     = excluded.drafts_folder,
      trash_folder      = excluded.trash_folder,
      spam_folder       = excluded.spam_folder
  `).run(
    account.id,
    imapConfig.host, imapConfig.port, imapConfig.tls ? 1 : 0, imapConfig.user, imapEnc,
    folderMap?.sent   || getSentFolder(providerKey),
    folderMap?.drafts || getDraftsFolder(providerKey),
    folderMap?.trash  || getTrashFolder(providerKey),
    folderMap?.spam   || getSpamFolder(providerKey),
  );

  db.prepare(`
    INSERT INTO smtp_credentials
      (account_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_enc)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      smtp_host         = excluded.smtp_host,
      smtp_port         = excluded.smtp_port,
      smtp_secure       = excluded.smtp_secure,
      smtp_user         = excluded.smtp_user,
      smtp_password_enc = excluded.smtp_password_enc
  `).run(
    account.id,
    smtpConfig.host, smtpConfig.port, smtpConfig.secure ? 1 : 0, smtpConfig.user, smtpEnc,
  );

  db.prepare(`
    UPDATE email_accounts SET connected = 1, provider = ?, updated_at = unixepoch() WHERE id = ?
  `).run(providerKey, account.id);

  // Initial sync (async — don't block the response)
  syncAccount(account.id, db).catch(err =>
    console.error(`[sync] Initial sync failed for ${account.id}:`, err.message)
  );

  const updated = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(account.id);
  res.json({ account: dbToClient(updated), syncing: true });
});

// ── POST /api/accounts/:id/sync ───────────────────────────────────────────────
router.post("/accounts/:id/sync", async (req, res) => {
  const db      = getDb();
  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(req.params.id);
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!account.connected) return res.status(422).json({ error: "Account not connected" });

  try {
    const result = await syncAccount(account.id, db);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/accounts/:id/disconnect ────────────────────────────────────────
router.post("/accounts/:id/disconnect", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM imap_credentials WHERE account_id = ?").run(req.params.id);
  db.prepare("DELETE FROM smtp_credentials WHERE account_id = ?").run(req.params.id);
  if (req.body.deleteMessages) {
    db.prepare("DELETE FROM messages WHERE account_id = ?").run(req.params.id);
  }
  db.prepare("UPDATE email_accounts SET connected = 0, updated_at = unixepoch() WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── GET /api/messages ─────────────────────────────────────────────────────────
router.get("/messages", (req, res) => {
  const db = getDb();
  const {
    folder, accountId, limit = 100, offset = 0,
    unread, starred, search, threadId,
  } = req.query;

  let accountIds;
  if (accountId) {
    accountIds = [accountId];
  } else {
    accountIds = db.prepare("SELECT id FROM email_accounts WHERE user_id = 'local'").all().map(a => a.id);
  }

  if (!accountIds.length) return res.json({ messages: [], total: 0 });

  const placeholders = accountIds.map(() => "?").join(",");
  const params = [...accountIds];
  const where  = [`account_id IN (${placeholders})`];

  if (folder)         { where.push("folder = ?");      params.push(folder); }
  if (unread === "1") { where.push("is_unread = 1"); }
  if (starred === "1"){ where.push("is_starred = 1"); }
  if (threadId)       { where.push("thread_id = ?");   params.push(threadId); }
  if (search) {
    where.push("(subject LIKE ? OR from_name LIKE ? OR from_email LIKE ? OR preview LIKE ?)");
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const whereStr   = where.join(" AND ");
  const countParams = [...params];
  const dataParams  = [...params, Number(limit), Number(offset)];

  const total    = db.prepare(`SELECT COUNT(*) as n FROM messages WHERE ${whereStr}`).get(...countParams).n;
  const messages = db.prepare(
    `SELECT * FROM messages WHERE ${whereStr} ORDER BY date_sent DESC LIMIT ? OFFSET ?`
  ).all(...dataParams);

  res.json({ messages: messages.map(msgToClient), total });
});

// ── PATCH /api/messages/:id ───────────────────────────────────────────────────
router.patch("/messages/:id", (req, res) => {
  const db  = getDb();
  const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(req.params.id);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  const { folder, isUnread, isStarred, labels } = req.body;
  const updates = [], params = [];

  if (folder    !== undefined) { updates.push("folder = ?");      params.push(folder); }
  if (isUnread  !== undefined) { updates.push("is_unread = ?");   params.push(isUnread ? 1 : 0); }
  if (isStarred !== undefined) { updates.push("is_starred = ?");  params.push(isStarred ? 1 : 0); }
  if (labels    !== undefined) { updates.push("labels_json = ?"); params.push(JSON.stringify(labels)); }

  if (!updates.length) return res.json({ message: msgToClient(msg) });

  params.push(msg.id);
  db.prepare(`UPDATE messages SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  const updated = db.prepare("SELECT * FROM messages WHERE id = ?").get(msg.id);
  res.json({ message: msgToClient(updated) });
});

// ── POST /api/messages/send ───────────────────────────────────────────────────
router.post("/messages/send", async (req, res) => {
  const { accountId, to, cc, bcc, subject, text, html } = req.body;
  if (!accountId || !to || !subject) {
    return res.status(400).json({ error: "accountId, to, and subject are required" });
  }

  const db      = getDb();
  const account = db.prepare("SELECT * FROM email_accounts WHERE id = ?").get(accountId);
  if (!account) return res.status(404).json({ error: "Account not found" });
  if (!account.connected) return res.status(422).json({ error: "Account not connected — configure IMAP/SMTP first" });

  try {
    const info = await sendFromAccount(accountId, db, {
      from: `${account.name} <${account.email}>`,
      to, cc, bcc, subject, text, html,
    });

    const msgId = uuidv4();
    db.prepare(`
      INSERT INTO messages
        (id, account_id, folder, message_id, from_name, from_email, to_addr, cc_addr,
         subject, preview, body, body_html, date_sent, is_unread, is_starred,
         has_attachment, attachments_json, labels_json)
      VALUES (?, ?, 'Sent', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '[]', '[]')
    `).run(
      msgId, accountId, info.messageId || uuidv4(),
      account.name, account.email,
      to, cc || "",
      subject,
      (text || "").slice(0, 160).trim(),
      text || "", html || "",
      new Date().toISOString(),
    );

    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function dbToClient(row) {
  return {
    id:        row.id,
    name:      row.name,
    email:     row.email,
    color:     row.color,
    isDefault: !!row.is_default,
    signature: row.signature,
    sortOrder: row.sort_order,
    provider:  row.provider,
    connected: !!row.connected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function msgToClient(row) {
  let attachments = [], labels = [];
  try { attachments = JSON.parse(row.attachments_json || "[]"); } catch {}
  try { labels      = JSON.parse(row.labels_json      || "[]"); } catch {}
  return {
    id:             row.id,
    accountId:      row.account_id,
    folder:         row.folder,
    messageId:      row.message_id,
    from:           row.from_name,
    fromEmail:      row.from_email,
    to:             row.to_addr,
    cc:             row.cc_addr,
    subject:        row.subject,
    preview:        row.preview,
    body:           row.body,
    bodyHtml:       row.body_html,
    date:           row.date_sent,
    unread:         !!row.is_unread,
    starred:        !!row.is_starred,
    hasAttachment:  !!row.has_attachment,
    attachments,
    labels,
    threadId:       row.thread_id,
    inReplyTo:      row.in_reply_to,
    unsubscribeUrl: row.unsubscribe_url,
  };
}

function getSentFolder(key) {
  const map = { gmail:"[Gmail]/Sent Mail", outlook:"Sent Items", yahoo:"Sent", icloud:"Sent Messages" };
  return map[key] || "Sent";
}
function getDraftsFolder(key) {
  const map = { gmail:"[Gmail]/Drafts", outlook:"Drafts", yahoo:"Draft" };
  return map[key] || "Drafts";
}
function getTrashFolder(key) {
  const map = { gmail:"[Gmail]/Trash", outlook:"Deleted Items", yahoo:"Trash" };
  return map[key] || "Trash";
}
function getSpamFolder(key) {
  const map = { gmail:"[Gmail]/Spam", outlook:"Junk Email", yahoo:"Bulk Mail" };
  return map[key] || "Spam";
}

module.exports = router;
