import { useState, useEffect, useCallback } from "react";

const isElectron = !!window.electronAPI;

/**
 * UpdateBanner — sits just below the topbar.
 * Driven entirely by events from the main process via preload.
 * Props: { dark, onManualCheck }
 */
export default function UpdateBanner({ dark, onManualCheck }) {
  const [status,       setStatus]       = useState(null);   // latest updater event
  const [dismissed,    setDismissed]    = useState(null);   // version string user dismissed
  const [manualCheck,  setManualCheck]  = useState(false);  // true when user clicked "Check"

  // Subscribe to events from main process
  useEffect(() => {
    if (!isElectron) return;
    const unsub = window.electronAPI.onUpdaterStatus(s => {
      setStatus(s);
      if (s.type === "up-to-date" || s.type === "error") {
        // Auto-hide the "up to date" state after 4s
        setTimeout(() => setStatus(p => (p === s ? null : p)), 4000);
      }
    });
    return unsub;
  }, []);

  // Expose manual check trigger to parent (Settings page)
  useEffect(() => {
    if (onManualCheck) onManualCheck(() => {
      setManualCheck(true);
      window.electronAPI?.updaterCheck();
    });
  }, [onManualCheck]);

  const dismiss = useCallback((version) => {
    setDismissed(version);
    window.electronAPI?.updaterDismiss(version);
  }, []);

  // Nothing to show?
  if (!isElectron || !status) return null;
  if (status.type === "checking" && !manualCheck) return null;
  if (status.type === "up-to-date" && !manualCheck) return null;
  if (status.type === "available" && dismissed === status.version) return null;
  if (status.type === "error" && !status.message) return null;   // silent network error

  const bg      = dark ? "#1a1a1a" : "#f0f0f0";
  const border  = dark ? "#2a2a2a" : "#e0e0e0";
  const text    = dark ? "#f0f0f0" : "#111";
  const sub     = dark ? "#888"    : "#666";
  const btnBg   = dark ? "#fff"    : "#111";
  const btnText = dark ? "#111"    : "#fff";

  const Btn = ({ label, onClick, danger }) => (
    <button onClick={onClick} style={{
      background: danger ? "#cc4444" : btnBg,
      color: danger ? "#fff" : btnText,
      border: "none", borderRadius: 6, padding: "5px 12px",
      fontSize: 11, fontWeight: 600, cursor: "pointer",
      fontFamily: "inherit", letterSpacing: "0.02em", flexShrink: 0,
    }}>
      {label}
    </button>
  );

  const GhostBtn = ({ label, onClick }) => (
    <button onClick={onClick} style={{
      background: "none", border: `1px solid ${border}`,
      color: sub, borderRadius: 6, padding: "4px 10px",
      fontSize: 11, cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{
      background: bg, borderBottom: `1px solid ${border}`,
      padding: "8px 16px", display: "flex", alignItems: "center",
      gap: 12, flexShrink: 0, animation: "fadeUp 0.2s ease",
    }}>
      {/* Icon */}
      <div style={{ flexShrink: 0 }}>
        {status.type === "checking"    && <Spinner color={sub} />}
        {status.type === "available"   && <UpdateIcon color="#4a90d9" />}
        {status.type === "downloading" && <Spinner color="#4a90d9" />}
        {status.type === "downloaded"  && <CheckIcon color="#4caf50" />}
        {status.type === "up-to-date"  && <CheckIcon color="#4caf50" />}
        {status.type === "error"       && <ErrorIcon color="#cc4444" />}
      </div>

      {/* Message */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {status.type === "checking" && (
          <span style={{ fontSize: 12, color: text }}>Checking for updates…</span>
        )}
        {status.type === "available" && (
          <span style={{ fontSize: 12, color: text }}>
            <strong>Letter {status.version}</strong> is available
            {status.notes ? <span style={{ color: sub }}> — {stripHtml(status.notes).slice(0, 100)}</span> : ""}
          </span>
        )}
        {status.type === "downloading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: text }}>
              Downloading update… {status.percent}%
            </span>
            <div style={{ flex: 1, maxWidth: 160, height: 4, background: border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${status.percent}%`, height: "100%", background: "#4a90d9", borderRadius: 2, transition: "width 0.3s" }} />
            </div>
            {status.speed > 0 && <span style={{ fontSize: 10, color: sub }}>{status.speed} KB/s</span>}
          </div>
        )}
        {status.type === "downloaded" && (
          <span style={{ fontSize: 12, color: text }}>
            <strong>Letter {status.version}</strong> is ready to install
          </span>
        )}
        {status.type === "up-to-date" && (
          <span style={{ fontSize: 12, color: sub }}>
            You're up to date — Letter {status.version}
          </span>
        )}
        {status.type === "error" && (
          <span style={{ fontSize: 12, color: "#cc4444" }}>
            Update error: {status.message}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {status.type === "available" && (
          <>
            <Btn label="Download Update" onClick={() => { setManualCheck(false); window.electronAPI.updaterDownload(); }} />
            <GhostBtn label="Later" onClick={() => dismiss(status.version)} />
          </>
        )}
        {status.type === "downloaded" && (
          <>
            <Btn label="Restart & Install" onClick={() => window.electronAPI.updaterInstall()} />
            <GhostBtn label="Later" onClick={() => setStatus(null)} />
          </>
        )}
        {status.type === "error" && (
          <GhostBtn label="Dismiss" onClick={() => { setStatus(null); setManualCheck(false); }} />
        )}
        {(status.type === "checking" || status.type === "up-to-date") && (
          <GhostBtn label="Dismiss" onClick={() => { setStatus(null); setManualCheck(false); }} />
        )}
      </div>
    </div>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function stripHtml(str) {
  return typeof str === "string" ? str.replace(/<[^>]*>/g, "") : "";
}

function Spinner({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
      style={{ animation: "spin 1s linear infinite" }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

function UpdateIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function CheckIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}
