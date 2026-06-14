/**
 * server/src/utils/providers.js
 * IMAP/SMTP presets for popular email providers.
 * Used to auto-fill connection settings when the user picks a known provider.
 */

const PROVIDERS = {
  gmail: {
    name:        "Gmail",
    domains:     ["gmail.com", "googlemail.com"],
    imap: {
      host:    "imap.gmail.com",
      port:    993,
      tls:     true,
    },
    smtp: {
      host:    "smtp.gmail.com",
      port:    587,
      secure:  false,   // STARTTLS
    },
    authNote: "Use an App Password — not your Google account password.\nGenerate one at: myaccount.google.com/apppasswords\n(Requires 2-Step Verification to be enabled.)",
    docsUrl:  "https://support.google.com/accounts/answer/185833",
    oauthSupported: false,
  },

  outlook: {
    name:        "Outlook / Hotmail",
    domains:     ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    imap: {
      host:    "outlook.office365.com",
      port:    993,
      tls:     true,
    },
    smtp: {
      host:    "smtp.office365.com",
      port:    587,
      secure:  false,
    },
    authNote: "Use your regular Microsoft account password.\nIf you use two-factor auth, generate an App Password at:\naccount.microsoft.com/security",
    docsUrl:  "https://support.microsoft.com/en-us/office/pop-imap-and-smtp-settings-8361e398-8af4-4e97-b147-6c6c4ac95353",
    oauthSupported: false,
  },

  yahoo: {
    name:    "Yahoo Mail",
    domains: ["yahoo.com", "yahoo.co.uk", "yahoo.com.au", "ymail.com"],
    imap: {
      host: "imap.mail.yahoo.com",
      port: 993,
      tls:  true,
    },
    smtp: {
      host:   "smtp.mail.yahoo.com",
      port:   587,
      secure: false,
    },
    authNote: "Yahoo requires an App Password.\nGenerate one at: login.yahoo.com/account/security\nSelect 'Generate app password' → 'Other App'.",
    docsUrl:  "https://help.yahoo.com/kb/generate-third-party-passwords-sln15241.html",
    oauthSupported: false,
  },

  icloud: {
    name:    "iCloud Mail",
    domains: ["icloud.com", "me.com", "mac.com"],
    imap: {
      host: "imap.mail.me.com",
      port: 993,
      tls:  true,
    },
    smtp: {
      host:   "smtp.mail.me.com",
      port:   587,
      secure: false,
    },
    authNote: "iCloud requires an App-Specific Password.\nGenerate one at: appleid.apple.com → Sign-In and Security → App-Specific Passwords.",
    docsUrl:  "https://support.apple.com/en-us/102654",
    oauthSupported: false,
  },

  aol: {
    name:    "AOL Mail",
    domains: ["aol.com"],
    imap: {
      host: "imap.aol.com",
      port: 993,
      tls:  true,
    },
    smtp: {
      host:   "smtp.aol.com",
      port:   587,
      secure: false,
    },
    authNote: "AOL requires an App Password.\nGenerate one at: login.aol.com → Account Security → Generate app password.",
    docsUrl:  "https://help.aol.com/articles/create-and-manage-app-password",
    oauthSupported: false,
  },

  zoho: {
    name:    "Zoho Mail",
    domains: ["zoho.com", "zohomail.com"],
    imap: {
      host: "imap.zoho.com",
      port: 993,
      tls:  true,
    },
    smtp: {
      host:   "smtp.zoho.com",
      port:   587,
      secure: false,
    },
    authNote: "Use your Zoho Mail password. If 2FA is enabled, generate an App Password in your Zoho account security settings.",
    docsUrl:  "https://www.zoho.com/mail/help/imap-access.html",
    oauthSupported: false,
  },

  fastmail: {
    name:    "Fastmail",
    domains: ["fastmail.com", "fastmail.fm"],
    imap: {
      host: "imap.fastmail.com",
      port: 993,
      tls:  true,
    },
    smtp: {
      host:   "smtp.fastmail.com",
      port:   587,
      secure: false,
    },
    authNote: "Use an App Password from Fastmail → Settings → Privacy & Security → App Passwords.",
    docsUrl:  "https://www.fastmail.help/hc/en-us/articles/360058752834",
    oauthSupported: false,
  },

  protonmail: {
    name:    "Proton Mail",
    domains: ["proton.me", "protonmail.com", "pm.me"],
    imap: {
      host: "127.0.0.1",
      port: 1143,
      tls:  false,
    },
    smtp: {
      host:   "127.0.0.1",
      port:   1025,
      secure: false,
    },
    authNote: "Proton Mail requires the Proton Mail Bridge app to be running.\nDownload it at: proton.me/mail/bridge\nUse the Bridge-generated password, not your Proton account password.",
    docsUrl:  "https://proton.me/support/protonmail-bridge-install",
    oauthSupported: false,
  },
};

/**
 * Detect provider from email address domain.
 * Returns the provider key (e.g. "gmail") or null if unknown.
 */
function detectProvider(email) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    if (provider.domains.includes(domain)) return key;
  }
  return null;
}

/**
 * Get provider config by key, or null if not found.
 */
function getProvider(key) {
  return PROVIDERS[key] || null;
}

/**
 * Get all providers as an array for the client to display.
 * Does not include sensitive fields.
 */
function listProviders() {
  return Object.entries(PROVIDERS).map(([key, p]) => ({
    key,
    name:     p.name,
    domains:  p.domains,
    authNote: p.authNote,
    docsUrl:  p.docsUrl,
    imap:     p.imap,
    smtp:     p.smtp,
  }));
}

module.exports = { detectProvider, getProvider, listProviders, PROVIDERS };
