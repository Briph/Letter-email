import App from "./App";

// Detect persisted dark mode preference before full load (avoids flash)
const initDark = (() => {
  try {
    const s = JSON.parse(localStorage.getItem("letter-prefs") || "{}");
    return !!s.dark;
  } catch { return false; }
})();

export default function AppShell() {
  return (
    <App
      initialAccounts={[]}
      initialLabels={[]}
      initialSettings={{}}
      currentUser={null}
    />
  );
}
