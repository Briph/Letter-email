/**
 * src/AddAccountWizard.jsx
 * Multi-step wizard for connecting a real email account via IMAP/SMTP.
 *
 * Steps:
 *   1. Pick provider (Gmail, Outlook, Yahoo, iCloud, Other / Manual)
 *   2. Enter password / app password + test  (or OAuth flow for Gmail/Outlook)
 *   3. Confirm and connect
 */

import { useState, useEffect, useRef } from "react";

// Providers that support OAuth2 (in addition to App Password)
const OAUTH_PROVIDERS = new Set(["gmail", "outlook"]);

const PROVIDER_ICONS = {
  gmail:      { emoji: "🔴", label: "Gmail" },
  outlook:    { emoji: "🔵", label: "Outlook / Hotmail" },
  yahoo:      { emoji: "🟣", label: "Yahoo Mail" },
  icloud:     { emoji: "☁️",  label: "iCloud Mail" },
  aol:        { emoji: "🟡", label: "AOL Mail" },
  zoho:       { emoji: "🟢", label: "Zoho Mail" },
  fastmail:   { emoji: "⚡", label: "Fastmail" },
  protonmail: { emoji: "🛡️", label: "Proton Mail" },
  manual:     { emoji: "⚙️", label: "Other / Manual" },
};

export default function AddAccountWizard({ account, onDone, onCancel, dark }) {
  const [step,       setStep]       = useState(1);        // 1=provider, 2=credentials, 3=success
  const [providers,  setProviders]  = useState([]);
  const [selected,   setSelected]   = useState(null);     // provider key
  const [provConf,   setProvConf]   = useState(null);     // full provider config from server

  // Credential fields
  const [password,   setPassword]   = useState("");
  const [imapHost,   setImapHost]   = useState("");
  const [imapPort,   setImapPort]   = useState("993");
  const [imapTls,    setImapTls]    = useState(true);
  const [smtpHost,   setSmtpHost]   = useState("");
  const [smtpPort,   setSmtpPort]   = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpPass,   setSmtpPass]   = useState("");       // only for manual where SMTP pass differs
  const [samePass,   setSamePass]   = useState(true);     // SMTP uses same password as IMAP

  const [showPass,   setShowPass]   = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error,      setError]      = useState("");
  const [connectedAccount, setConnectedAccount] = useState(null); // result stored for step 3

  // OAuth2 flow state
  const [oauthPending,  setOauthPending]  = useState(false); // waiting for browser window
  const [oauthState,    setOauthState]    = useState(null);  // state token for polling
  const pollRef = useRef(null);

  // ── Theme — defined early so render functions can reference it ─────────────
  const T = dark
    ? { bg: "#111", panel: "#161616", border: "#242424", text: "#f0f0f0", sub: "#888", input: "#1c1c1c" }
    : { bg: "#fff", panel: "#f5f5f5", border: "#e4e4e4", text: "#111",    sub: "#888", input: "#f8f8f8" };

  const inputStyle = {
    width: "100%", background: T.input, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "9px 12px", fontSize: 13, color: T.text,
    fontFamily: "inherit", outline: "none", transition: "border-color 0.15s",
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, color: T.sub,
    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5,
  };

  // ── selectProvider defined before useEffect so the effect can reference it ──
  const selectProvider = (prov) => {
    setSelected(prov.key);
    setProvConf(prov);
    setImapHost(prov.imap?.host || "");
    setImapPort(String(prov.imap?.port || 993));
    setImapTls(prov.imap?.tls !== false);
    setSmtpHost(prov.smtp?.host || "");
    setSmtpPort(String(prov.smtp?.port || 587));
    setSmtpSecure(prov.smtp?.secure || false);
    setTestResult(null);
    setError("");
  };

  // Fetch provider list on mount
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || "http://localhost:3001/api"}/providers`)
      .then(r => r.json())
      .then(d => {
        const list = d.providers || [];
        list.push({ key: "manual", name: "Other / Manual IMAP", domains: [], authNote: "Enter your server settings manually.", docsUrl: null, imap: { host:"", port:993, tls:true }, smtp: { host:"", port:587, secure:false } });
        setProviders(list);
        const domain = account.email.split("@")[1]?.toLowerCase();
        const match  = list.find(p => p.domains?.includes(domain));
        if (match) { selectProvider(match); }
      })
      .catch(() => {});
  // eslint-disable-next-line
  }, [account.email]);

  // ── Step 1: Provider picker ────────────────────────────────────────────────
  function renderStep1() {
    const displayProviders = [
      ...providers.filter(p => p.key !== "manual"),
      providers.find(p => p.key === "manual"),
    ].filter(Boolean);

    return (
      <>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>
          Connect {account.email}
        </h3>
        <p style={{ fontSize: 13, color: T.sub, marginBottom: 20, lineHeight: 1.5 }}>
          Choose your email provider. We'll pre-fill the server settings for you.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {displayProviders.map(p => {
            if (!p) return null;
            const icon = PROVIDER_ICONS[p.key] || { emoji: "📧", label: p.name };
            const isAuto = p.domains?.includes(account.email.split("@")[1]?.toLowerCase());
            return (
              <button key={p.key} onClick={() => { selectProvider(p); setStep(2); }} style={{
                display: "flex", alignItems: "center", gap: 12,
                background: T.panel, border: `1.5px solid ${isAuto ? "#4a90d9" : T.border}`,
                borderRadius: 10, padding: "12px 16px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "left", transition: "all 0.1s",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#4a90d9"}
                onMouseLeave={e => e.currentTarget.style.borderColor = isAuto ? "#4a90d9" : T.border}
              >
                <span style={{ fontSize: 22, lineHeight: 1 }}>{icon.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
                  {isAuto && <div style={{ fontSize: 11, color: "#4a90d9" }}>Detected from your email address</div>}
                  {p.key === "manual" && <div style={{ fontSize: 11, color: T.sub }}>Enter IMAP/SMTP settings manually</div>}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // ── OAuth2 flow ────────────────────────────────────────────────────────────
  async function handleOAuth() {
    setError(""); setOauthPending(true);
    try {
      const r = await fetch(
        `${process.env.REACT_APP_API_URL || "http://localhost:3001/api"}/oauth/start?provider=${selected}&accountId=${account.id}`
      );
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Could not start OAuth"); setOauthPending(false); return; }

      // Open the OAuth URL in a new browser window / Electron window
      const win = window.open(data.url, "letter-oauth", "width=600,height=700,scrollbars=yes");
      setOauthState(data.state);

      // Poll the server for completion every 2 seconds
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(
            `${process.env.REACT_APP_API_URL || "http://localhost:3001/api"}/oauth/status/${data.state}`
          );
          const pd = await pr.json();
          if (pd.error) {
            clearInterval(pollRef.current);
            setOauthPending(false);
            setError(pd.error);
          } else if (pd.done) {
            clearInterval(pollRef.current);
            setOauthPending(false);
            if (win && !win.closed) try { win.close(); } catch {}
            // Account is now connected — advance to success step
            setConnectedAccount(account);
            setStep(3);
          } else if (win && win.closed) {
            // User closed the window manually before completing
            clearInterval(pollRef.current);
            setOauthPending(false);
            setError("Sign-in window was closed. Please try again.");
          }
        } catch { /* network blip — keep polling */ }
      }, 2000);
    } catch (err) {
      setOauthPending(false);
      setError("Could not reach server — is it running?");
    }
  }

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Step 2: Credentials ────────────────────────────────────────────────────
  async function handleTest() {
    setError(""); setTestResult(null); setTesting(true);
    try {
      const token = localStorage.getItem("letter_access");
      const r = await fetch(
        `${process.env.REACT_APP_API_URL || "http://localhost:3001/api"}/accounts/${account.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            imap: { host: imapHost, port: Number(imapPort), tls: imapTls, password },
            smtp: { host: smtpHost, port: Number(smtpPort), secure: smtpSecure, password: samePass ? password : smtpPass },
          }),
        }
      );
      const data = await r.json();
      setTestResult(data);
      if (!data.imapOk || !data.smtpOk) {
        setError([data.imapError, data.smtpError].filter(Boolean).join(" | "));
      }
    } catch { setError("Could not reach server — is it running?"); }
    finally { setTesting(false); }
  }

  async function handleConnect() {
    if (!password) { setError("Password is required"); return; }
    setError(""); setConnecting(true);
    try {
      const token = localStorage.getItem("letter_access");
      const r = await fetch(
        `${process.env.REACT_APP_API_URL || "http://localhost:3001/api"}/accounts/${account.id}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            provider: selected,
            imap: { host: imapHost, port: Number(imapPort), tls: imapTls, password },
            smtp: { host: smtpHost, port: Number(smtpPort), secure: smtpSecure, password: samePass ? password : smtpPass },
          }),
        }
      );
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Connection failed"); return; }
      // Store result and advance to step 3 — onDone is called when user clicks Done
      setConnectedAccount(data.account);
      setStep(3);
    } catch { setError("Could not reach server"); }
    finally { setConnecting(false); }
  }

  function renderStep2() {
    const isManual = selected === "manual";
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <button onClick={() => setStep(1)} style={{ background: "none", border: "none", cursor: "pointer", color: T.sub, padding: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "inherit" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text }}>
            {PROVIDER_ICONS[selected]?.emoji} {provConf?.name || "Connect account"}
          </span>
        </div>

        {/* OAuth2 sign-in button — shown for Gmail and Outlook */}
        {OAUTH_PROVIDERS.has(selected) && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={handleOAuth}
              disabled={oauthPending}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: oauthPending ? (dark ? "#2a2a2a" : "#e8e8e8") : (dark ? "#fff" : "#fff"),
                color: dark ? "#111" : "#111",
                border: `1px solid ${T.border}`, borderRadius: 9,
                padding: "11px 16px", fontSize: 13, fontWeight: 600,
                fontFamily: "inherit", cursor: oauthPending ? "default" : "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,.08)",
              }}
            >
              {oauthPending ? (
                <>
                  <Spinner />
                  Waiting for sign-in…
                </>
              ) : selected === "gmail" ? (
                <>
                  <GoogleIcon />
                  Sign in with Google
                </>
              ) : (
                <>
                  <MicrosoftIcon />
                  Sign in with Microsoft
                </>
              )}
            </button>
            {oauthPending && (
              <p style={{ fontSize: 11, color: T.sub, textAlign: "center", marginTop: 8 }}>
                Complete sign-in in the browser window, then return here.
              </p>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: T.border }} />
              <span style={{ fontSize: 11, color: T.sub }}>or use App Password</span>
              <div style={{ flex: 1, height: 1, background: T.border }} />
            </div>
          </div>
        )}

        {/* Auth note for known providers */}
        {provConf?.authNote && (
          <div style={{ background: dark ? "#1a1a2e" : "#f0f5ff", border: `1px solid ${dark?"#2a2a4e":"#c0d0f0"}`, borderRadius: 9, padding: "12px 14px", marginBottom: 18, fontSize: 12, color: dark ? "#aac" : "#446", lineHeight: 1.7, whiteSpace: "pre-line" }}>
            <strong style={{ color: dark ? "#ccf" : "#226" }}>ℹ️ Important:</strong>{"\n"}{provConf.authNote}
            {provConf.docsUrl && <div style={{ marginTop: 6 }}><a href={provConf.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9", fontSize: 11 }}>Setup guide →</a></div>}
          </div>
        )}

        {/* Password field */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{isManual ? "IMAP Password" : "App Password"}</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
              placeholder={isManual ? "Your IMAP password" : "xxxx xxxx xxxx xxxx"}
              style={{ ...inputStyle, paddingRight: 42 }} autoComplete="off"
              onFocus={e => e.target.style.borderColor = "#4a90d9"}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            <button type="button" onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: T.sub }}>
              {showPass ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        {/* Manual IMAP settings */}
        {isManual && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, marginTop: 18 }}>IMAP Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>IMAP Host</label>
                <input value={imapHost} onChange={e => setImapHost(e.target.value)} placeholder="imap.example.com" style={inputStyle}
                  onFocus={e => e.target.style.borderColor="#4a90d9"} onBlur={e => e.target.style.borderColor=T.border}/>
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input value={imapPort} onChange={e => setImapPort(e.target.value)} placeholder="993" style={inputStyle}
                  onFocus={e => e.target.style.borderColor="#4a90d9"} onBlur={e => e.target.style.borderColor=T.border}/>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.sub, cursor: "pointer", marginBottom: 18 }}>
              <input type="checkbox" checked={imapTls} onChange={e => setImapTls(e.target.checked)} style={{ accentColor: "#4a90d9" }}/>
              Use TLS/SSL
            </label>

            <div style={{ fontSize: 11, fontWeight: 700, color: T.sub, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>SMTP Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>SMTP Host</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.example.com" style={inputStyle}
                  onFocus={e => e.target.style.borderColor="#4a90d9"} onBlur={e => e.target.style.borderColor=T.border}/>
              </div>
              <div>
                <label style={labelStyle}>Port</label>
                <input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" style={inputStyle}
                  onFocus={e => e.target.style.borderColor="#4a90d9"} onBlur={e => e.target.style.borderColor=T.border}/>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.sub, cursor: "pointer", marginBottom: 10 }}>
              <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} style={{ accentColor: "#4a90d9" }}/>
              Use SSL (port 465) instead of STARTTLS
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.sub, cursor: "pointer", marginBottom: 18 }}>
              <input type="checkbox" checked={samePass} onChange={e => setSamePass(e.target.checked)} style={{ accentColor: "#4a90d9" }}/>
              SMTP uses the same password as IMAP
            </label>
            {!samePass && (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>SMTP Password</label>
                <input type={showPass ? "text" : "password"} value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="SMTP password" style={inputStyle}
                  onFocus={e => e.target.style.borderColor="#4a90d9"} onBlur={e => e.target.style.borderColor=T.border}/>
              </div>
            )}
          </>
        )}

        {/* Test result */}
        {testResult && (
          <div style={{ background: T.panel, borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 12 }}>
            <div style={{ color: testResult.imapOk ? "#4caf50" : "#cc4444", marginBottom: 4 }}>
              {testResult.imapOk ? "✓" : "✗"} IMAP: {testResult.imapOk ? "Connected" : testResult.imapError}
            </div>
            <div style={{ color: testResult.smtpOk ? "#4caf50" : "#cc4444" }}>
              {testResult.smtpOk ? "✓" : "✗"} SMTP: {testResult.smtpOk ? "Connected" : testResult.smtpError}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: dark ? "#2a0a0a" : "#fff5f5", border: "1px solid #ffbbbb", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#cc4444", marginBottom: 14, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleTest} disabled={!password || testing} style={{
            flex: 1, background: "none", border: `1px solid ${T.border}`, borderRadius: 9, padding: "11px",
            fontFamily: "inherit", fontSize: 13, color: T.sub, cursor: !password ? "default" : "pointer", opacity: !password ? 0.5 : 1,
          }}>
            {testing ? "Testing…" : "Test Connection"}
          </button>
          <button onClick={handleConnect} disabled={!password || connecting} style={{
            flex: 2, background: !password ? "#ccc" : "#111", color: !password ? "#888" : "#fff",
            border: "none", borderRadius: 9, padding: "11px", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
            cursor: !password ? "default" : "pointer",
          }}>
            {connecting ? "Connecting…" : "Connect Account"}
          </button>
        </div>
      </>
    );
  }

  // ── Step 3: Success ────────────────────────────────────────────────────────
  function renderStep3() {
    return (
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>Account Connected!</h3>
        <p style={{ fontSize: 13, color: T.sub, marginBottom: 24, lineHeight: 1.6 }}>
          <strong style={{ color: T.text }}>{account.email}</strong> is now connected.<br/>
          Your emails are syncing in the background.
        </p>
        <button onClick={() => onDone?.(connectedAccount)} style={{
          background: "#111", color: "#fff", border: "none", borderRadius: 9,
          padding: "12px 28px", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onCancel?.()}>
      <div style={{
        background: T.bg, borderRadius: 14, border: `1.5px solid ${T.border}`,
        padding: 28, width: "100%", maxWidth: 480,
        boxShadow: "0 24px 64px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto",
      }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step < 3 && (
          <button onClick={onCancel} style={{ display: "block", width: "100%", background: "none", border: "none", color: T.sub, fontSize: 12, cursor: "pointer", marginTop: 16, fontFamily: "inherit" }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21">
      <rect x="1"  y="1"  width="9" height="9" fill="#f25022"/>
      <rect x="7"  y="1"  width="9" height="9" fill="#7fba00"/>
      <rect x="1"  y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
  );
}
