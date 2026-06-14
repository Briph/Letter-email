/**
 * src/AuthScreen.jsx
 * Sign in / Sign up screen shown when no user is authenticated.
 * Works identically on web and in the Electron app.
 */

import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthScreen({ dark }) {
  const { signIn, signUp } = useAuth();
  const [mode,        setMode]        = useState("signin"); // "signin" | "signup"
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [showPass,    setShowPass]    = useState(false);

  const T = dark ? {
    bg:"#0a0a0a", surface:"#111", border:"#242424",
    text:"#f0f0f0", sub:"#888", input:"#1c1c1c",
    btnBg:"#ffffff", btnText:"#111",
  } : {
    bg:"#f8f8f8", surface:"#ffffff", border:"#e4e4e4",
    text:"#111", sub:"#888", input:"#f5f5f5",
    btnBg:"#111111", btnText:"#fff",
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        await signUp(email, password, displayName || undefined);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: "100%", background: T.input, border: `1px solid ${T.border}`,
    borderRadius: 9, padding: "11px 14px", fontSize: 14, color: T.text,
    fontFamily: "inherit", outline: "none", transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontSize: 12, fontWeight: 600, color: T.sub,
    textTransform: "uppercase", letterSpacing: "0.06em",
    display: "block", marginBottom: 6,
  };

  return (
    <div style={{
      height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: T.bg, fontFamily: "'Inter', system-ui, sans-serif", color: T.text,
    }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: dark ? "#111" : "#111",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>Letter</h1>
          <p style={{ fontSize: 14, color: T.sub, marginTop: 6, margin: "6px 0 0" }}>
            {mode === "signin" ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: T.surface, borderRadius: 16,
          border: `1px solid ${T.border}`, padding: 32,
          boxShadow: dark ? "0 8px 40px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <form onSubmit={handleSubmit}>

            {mode === "signup" && (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Display name</label>
                <input
                  type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)}
                  placeholder="Alex Hayes" style={inputStyle} autoComplete="name"
                  onFocus={e=>e.target.style.borderColor="#4a90d9"}
                  onBlur={e=>e.target.style.borderColor=T.border}
                />
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle} autoComplete="email"
                required
                onFocus={e=>e.target.style.borderColor="#4a90d9"}
                onBlur={e=>e.target.style.borderColor=T.border}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"} value={password}
                  onChange={e=>setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                  style={{ ...inputStyle, paddingRight: 44 }} autoComplete={mode==="signup"?"new-password":"current-password"}
                  required minLength={mode === "signup" ? 8 : 1}
                  onFocus={e=>e.target.style.borderColor="#4a90d9"}
                  onBlur={e=>e.target.style.borderColor=T.border}
                />
                <button type="button" onClick={()=>setShowPass(s=>!s)} style={{
                  position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: T.sub, padding: 2,
                }}>
                  {showPass
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div style={{
                background: dark ? "#2a0a0a" : "#fff5f5",
                border: "1px solid #ffbbbb", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, color: "#cc4444",
                marginBottom: 20, lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: "100%", background: loading ? (dark?"#333":"#555") : T.btnBg,
              color: T.btnText, border: "none", borderRadius: 9,
              padding: "12px", fontSize: 14, fontWeight: 700,
              cursor: loading ? "default" : "pointer", fontFamily: "inherit",
              transition: "opacity 0.15s", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}>
              {loading && <Spinner />}
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          {/* Toggle mode */}
          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: T.sub }}>
            {mode === "signin" ? (
              <>Don't have an account?{" "}
                <button onClick={()=>{setMode("signup");setError("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#4a90d9",fontSize:13,fontWeight:600,fontFamily:"inherit",padding:0}}>Create one</button>
              </>
            ) : (
              <>Already have an account?{" "}
                <button onClick={()=>{setMode("signin");setError("");}} style={{background:"none",border:"none",cursor:"pointer",color:"#4a90d9",fontSize:13,fontWeight:600,fontFamily:"inherit",padding:0}}>Sign in</button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: 11, color: T.sub, marginTop: 24, lineHeight: 1.6 }}>
          Your accounts and settings are encrypted and synced across all your devices.
        </p>
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
