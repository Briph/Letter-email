/**
 * src/AddAccountWizard.jsx
 * Multi-step wizard for connecting a real email account via IMAP/SMTP.
 *
 * Steps:
 *   1. Pick provider (Gmail, Outlook, Yahoo, iCloud, Other / Manual)
 *   2. Enter password / app password + test
 *   3. Confirm and connect
 */

import { useState, useEffect } from "react";

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
