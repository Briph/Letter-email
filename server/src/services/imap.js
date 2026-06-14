/**
 * server/src/services/imap.js
 * IMAP connection management.
 * - testConnection(config)          — verify credentials without persisting
 * - fetchMessages(config, options)  — fetch messages from a mailbox
 * - syncAccount(accountId, db)      — full incremental sync for a stored account
 */

const Imap             = require("imap");
const { simpleParser } = require("mailparser");
const { decrypt }      = require("../utils/crypto");
const { randomUUID }   = require("crypto");

// ── Low-level IMAP helpers ────────────────────────────────────────────────────

/**
 * Open an IMAP connection and return a promise that resolves with the client.
 * The caller is responsible for calling imap.end() when done.
 */
function openImap(config) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user:          config.user,
      password:      config.password,
      host:          config.host,
      port:          config.port || 993,
      tls:           config.tls !== false,
      tlsOptions:    { rejectUnauthorized: config.tls !== false },
      connTimeout:   15000,
      authTimeout:   10000,
    });

    imap.once("ready", () => {
      // Bug 5 fix: attach a persistent error handler so post-resolve errors
      // don't become uncaught exceptions and crash the process.
      imap.on("error", (err) => {
        console.warn("[imap] connection error after ready:", err.message);
      });
      resolve(imap);
    });
    imap.once("error", (err) => reject(err));
    imap.connect();
  });
}

/**
 * Open a mailbox on an already-connected IMAP client.
 */
function openMailbox(imap, mailbox = "INBOX", readOnly = true) {
  return new Promise((resolve, reject) => {
    imap.openBox(mailbox, readOnly, (err, box) => {
      if (err) return reject(err);
      resolve(box);
    });
  });
}

function addrToString(addr) {
  if (!addr) return "";
  if (addr.name) return addr.name;
  return addr.address || "";
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Test IMAP credentials without persisting anything.
 * Returns { ok: true, mailboxes: [...] } or throws with a user-friendly message.
 */
async function testImapConnection(config) {
  let imap;
  try {
    imap = await openImap(config);
    // Try listing mailboxes as a real connectivity test
    const mailboxes = await new Promise((resolve, reject) => {
      imap.getBoxes((err, boxes) => {
        if (err) return reject(err);
        resolve(Object.keys(boxes || {}));
      });
    });
    return { ok: true, mailboxes };
  } catch (err) {
    const msg = friendlyImapError(err);
    throw new Error(msg);
  } finally {
    if (imap) try { imap.end(); } catch {}
  }
}

/**
 * Fetch the most recent N messages from a mailbox.
 * config: { user, password, host, port, tls }
 * options: { mailbox, limit, sinceUid }
 */
async function fetchRecentMessages(config, options = {}) {
  const mailboxName = options.mailbox || "INBOX";
  const limit       = options.limit   || 50;

  let imap;
  try {
    imap = await openImap(config);
    const box = await openMailbox(imap, mailboxName, true);

    if (box.messages.total === 0) return [];

    const start = Math.max(1, box.messages.total - limit + 1);
    const range = `${start}:*`;

    // Bug 3/8 fix: collect a Promise per message so we can await ALL of them
    // before resolving. Using msg.once("end", async) alone is unsafe because
    // f.once("end") fires when the IMAP stream ends, not when all async
    // simpleParser calls complete — which would return a partial array.
    const parsePromises = [];

    await new Promise((resolve, reject) => {
      const f = imap.fetch(range, { bodies: "", struct: true });

      f.on("message", (msg) => {
        const bufs  = [];
        let   attrs = {};

        msg.on("body", (stream) => {
          stream.on("data", c => bufs.push(c));
        });
        msg.once("attributes", a => { attrs = a; });

        // Push a promise that resolves when this single message is fully parsed
        const p = new Promise((msgResolve) => {
          msg.once("end", () => {
            const raw = Buffer.concat(bufs).toString();
            simpleParser(raw)
              .then(parsed => {
                // Extract List-Unsubscribe header for unsubscribe button
                const unsubHeader = parsed.headers?.get("list-unsubscribe") || "";
                const unsubMatch  = unsubHeader.match(/<(https?:[^>]+)>/i) || unsubHeader.match(/(https?:\S+)/i);
                const unsubscribeUrl = unsubMatch ? unsubMatch[1] : null;
                // Threading headers for In-Reply-To grouping
                const inReplyTo  = parsed.headers?.get("in-reply-to")  || null;
                const references = parsed.headers?.get("references")    || null;
                msgResolve({
                  uid:            attrs.uid,
                  messageId:      parsed.messageId || `uid-${attrs.uid}`,
                  from:           addrToString(parsed.from?.value?.[0]),
                  fromEmail:      parsed.from?.value?.[0]?.address || "",
                  to:             (parsed.to?.value   || []).map(a => a.address).join(", "),
                  cc:             (parsed.cc?.value   || []).map(a => a.address).join(", "),
                  subject:        parsed.subject || "(no subject)",
                  preview:        (parsed.text || "").slice(0, 160).replace(/\s+/g, " ").trim(),
                  body:           parsed.text     || "",
                  bodyHtml:       parsed.html     || "",
                  date:           parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
                  flags:          attrs.flags || [],
                  unread:         !(attrs.flags || []).includes("\\Seen"),
                  starred:        (attrs.flags  || []).includes("\\Flagged"),
                  hasAttachment:  (parsed.attachments || []).length > 0,
                  attachments:    (parsed.attachments || []).map(a => ({
                    filename: a.filename || "attachment",
                    size:     a.size     || 0,
                  })),
                  mailbox:        mailboxName,
                  unsubscribeUrl,
                  inReplyTo,
                  references,
                });
              })
              .catch(() => msgResolve(null)); // skip unparseable messages
          });
        });
        parsePromises.push(p);
      });

      f.once("error", reject);
      // Only resolve the outer promise once the IMAP fetch stream is done
      // collecting raw data — the actual parsing happens in parsePromises below
      f.once("end", resolve);
    });

    // Now await all parse promises together — this is the safe resolution point
    const results = await Promise.all(parsePromises);
    return results.filter(Boolean).reverse(); // newest first, drop nulls
  } finally {
    if (imap) try { imap.end(); } catch {}
  }
}

/**
 * Sync a single account — fetch recent messages across standard mailboxes
 * and upsert them into the messages table.
 */
async function syncAccount(accountId, db) {
  const cred = db.prepare(
    "SELECT * FROM imap_credentials WHERE account_id = ?"
  ).get(accountId);

  if (!cred) throw new Error("No IMAP credentials for this account");

  const config = {
    user:     cred.imap_user,
    password: decrypt(cred.imap_password_enc),
    host:     cred.imap_host,
    port:     cred.imap_port,
    tls:      !!cred.imap_tls,
  };

  // Map standard mailbox names to Letter folder names
  const mailboxMap = [
    { imap: "INBOX",         folder: "Inbox"   },
    { imap: cred.sent_folder   || "[Gmail]/Sent Mail", folder: "Sent"    },
    { imap: cred.drafts_folder || "[Gmail]/Drafts",    folder: "Drafts"  },
    { imap: cred.trash_folder  || "[Gmail]/Trash",     folder: "Trash"   },
    { imap: cred.spam_folder   || "[Gmail]/Spam",      folder: "Archive" },
  ];

  const errors = [];
  let totalSynced = 0;

  for (const { imap: mailboxName, folder } of mailboxMap) {
    try {
      const messages = await fetchRecentMessages(config, {
        mailbox: mailboxName,
        limit:   100,
      });

      const upsert = db.prepare(`
        INSERT INTO messages (
          id, account_id, folder, message_id, from_name, from_email,
          to_addr, cc_addr, subject, preview, body, body_html, date_sent,
          is_unread, is_starred, has_attachment, attachments_json, uid, imap_mailbox,
          in_reply_to, references_header, unsubscribe_url
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(account_id, message_id) DO UPDATE SET
          folder            = excluded.folder,
          is_unread         = excluded.is_unread,
          is_starred        = excluded.is_starred,
          unsubscribe_url   = excluded.unsubscribe_url,
          synced_at         = unixepoch()
      `);

      const insertMany = db.transaction((msgs) => {
        for (const m of msgs) {
          upsert.run(
            randomUUID(),
            accountId,
            folder,
            m.messageId,
            m.from,
            m.fromEmail,
            m.to,
            m.cc,
            m.subject,
            m.preview,
            m.body,
            m.bodyHtml,
            m.date,
            m.unread ? 1 : 0,
            m.starred ? 1 : 0,
            m.hasAttachment ? 1 : 0,
            JSON.stringify(m.attachments),
            m.uid,
            mailboxName,
            m.inReplyTo   || null,
            m.references  || null,
            m.unsubscribeUrl || null
          );
        }
      });

      insertMany(messages);
      totalSynced += messages.length;
    } catch (err) {
      // Mailbox may not exist for this provider — skip it
      if (!err.message?.includes("Mailbox doesn't exist") &&
          !err.message?.includes("NONEXISTENT")) {
        errors.push(`${mailboxName}: ${err.message}`);
      }
    }
  }

  // Update last-sync timestamp
  db.prepare(`
    UPDATE imap_credentials SET last_synced = unixepoch() WHERE account_id = ?
  `).run(accountId);

  return { synced: totalSynced, errors };
}

// ── Error message helpers ─────────────────────────────────────────────────────
function friendlyImapError(err) {
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("invalid credentials") || msg.includes("authentication failed") ||
      msg.includes("bad credentials") || msg.includes("[authenticationfailed]")) {
    return "Invalid username or password. If using Gmail/Yahoo/iCloud, make sure you are using an App Password, not your account password.";
  }
  if (msg.includes("connect etimedout") || msg.includes("connection timed out")) {
    return "Connection timed out. Check that IMAP is enabled for your account and the server hostname is correct.";
  }
  if (msg.includes("econnrefused")) {
    return "Connection refused. Check the IMAP host and port settings.";
  }
  if (msg.includes("self-signed") || msg.includes("certificate")) {
    return "SSL certificate error. Try disabling TLS verification (not recommended for production).";
  }
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) {
    return `Could not find server. Check the IMAP hostname.`;
  }
  return `IMAP error: ${err.message}`;
}

module.exports = { testImapConnection, fetchRecentMessages, syncAccount };
