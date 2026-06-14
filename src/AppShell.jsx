/**
 * src/AppShell.jsx
 * Sits between AuthProvider and App.
 * - Shows a loading spinner while restoring session
 * - Shows AuthScreen when signed out
 * - Shows App when signed in, syncing accounts/labels/settings from the server
 */

import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import AuthScreen from "./AuthScreen";
import App from "./App";
import { accounts as accountsApi, labels as labelsApi, settings as settingsApi } from "./api";

// Detect persisted dark mode preference before full load (avoids flash)
const initDark = (() => {
  try {
    const s = JSON.parse(localStorage.getItem("letter-prefs") || "{}");
    return !!s.dark;
  } catch { return false; }
})();

export default function AppShell() {
  const { user, loading: authLoading } = useAuth();
  const [serverData, setServerData] = useState(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dark, setDark] = useState(initDark);

  // When user signs in, fetch their server-side data
  useEffect(() => {
    if (!user) { setServerData(null); return; }

    setLoadingData(true);
    Promise.all([
      accountsApi.list().catch(() => []),
      labelsApi.list().catch(()   => []),
      settingsApi.get().catch(()  => {}),
    ]).then(([accounts, labels, settings]) => {
      setServerData({ accounts, labels, settings: settings || {} });
      if (settings?.dark !== undefined) setDark(settings.dark);
    }).finally(() => setLoadingData(false));
  }, [user?.id]);

  // Show spinner while checking auth
  if (authLoading || (user && loadingData && !serverData)) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: dark ? "#0a0a0a" : "#f8f8f8", fontFamily: "'Inter',system-ui,sans-serif",
      }}>
        <div style={{ textAlign: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke={dark ? "#555" : "#ccc"} strokeWidth="2.5"
            style={{ animation: "spin 0.8s linear infinite" }}>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
          </svg>
          <div style={{ marginTop: 16, fontSize: 13, color: dark ? "#555" : "#ccc" }}>Loading…</div>
        </div>
      </div>
    );
  }

  // Not signed in — show auth screen
  if (!user) {
    return <AuthScreen dark={dark} />;
  }

  // Signed in — pass server data as initial state overrides
  return (
    <App
      initialAccounts={serverData?.accounts ?? null}
      initialLabels={serverData?.labels   || []}
      initialSettings={serverData?.settings || {}}
      currentUser={user}
    />
  );
}
