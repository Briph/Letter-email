/**
 * server/src/services/smtp.js
 * SMTP send and connection test via nodemailer.
 */

const nodemailer = require("nodemailer");
const { decrypt } = require("../utils/crypto");

/**
 * Build a nodemailer transport from raw config.
 */
function createTransport(config) {
  return nodemailer.createTransport({
    host:   config.host,
    port:   config.port || 587,
    secure: config.secure || false,  // true = port 465 (SSL), false = STARTTLS
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: {
      rejectUnauthorized: config.rejectUnauthorized !== false,
    },
    connectionTimeout: 15000,
    greetingTimeout:   10000,
    socketTimeout:     20000,
  });
}

/**
 * Test SMTP credentials.
 * Returns { ok: true } or throws with a friendly message.
 */
async function testSmtpConnection(config) {
  const transport = createTransport(config);
  try {
    await transport.verify();
    return { ok: true };
  } catch (err) {
    throw new Error(friendlySmtpError(err));
  } finally {
    transport.close();
  }
}

/**
 * Send an email.
 * config: { user, password, host, port, secure }
 * message: { from, to, cc, subject, text, html }
 * Returns nodemailer info object.
 */
async function sendEmail(config, message) {
  const transport = createTransport(config);
  try {
    const info = await transport.sendMail({
      from:    message.from,
      to:      message.to,
      cc:      message.cc  || undefined,
      bcc:     message.bcc || undefined,
      subject: message.subject,
      text:    message.text,
      html:    message.html || undefined,
    });
    return info;
  } catch (err) {
    throw new Error(friendlySmtpError(err));
  } finally {
    transport.close();
  }
}

/**
 * Send from a stored account (reads credentials from DB).
 */
async function sendFromAccount(accountId, db, message) {
  const cred = db.prepare(
    "SELECT * FROM smtp_credentials WHERE account_id = ?"
  ).get(accountId);

  if (!cred) throw new Error("No SMTP credentials configured for this account");

  const config = {
    user:     cred.smtp_user,
    password: decrypt(cred.smtp_password_enc),
    host:     cred.smtp_host,
    port:     cred.smtp_port,
    secure:   !!cred.smtp_secure,
  };

  return sendEmail(config, message);
}

function friendlySmtpError(err) {
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("invalid login") || msg.includes("authentication") || msg.includes("535")) {
    return "SMTP authentication failed. Check your username and password (use an App Password for Gmail/Yahoo/iCloud).";
  }
  if (msg.includes("etimedout") || msg.includes("timed out")) {
    return "SMTP connection timed out. Check the server hostname and port.";
  }
  if (msg.includes("econnrefused")) {
    return "SMTP connection refused. Check the port (587 for STARTTLS, 465 for SSL).";
  }
  if (msg.includes("self signed") || msg.includes("certificate")) {
    return "SSL certificate error on SMTP server.";
  }
  return `SMTP error: ${err.message}`;
}

module.exports = { testSmtpConnection, sendEmail, sendFromAccount };
