/**
 * src/api.js
 * Thin fetch wrapper around the Letter server API.
 * Handles token storage, automatic access-token refresh, and sign-out on 401.
 */

const BASE = process.env.REACT_APP_API_URL || "http://localhost:3001/api";

// ── Token storage ─────────────────────────────────────────────────────────────
// Uses localStorage so tokens survive page refreshes.
// In the Electron app this is fine — it's a sandboxed renderer context.

const KEYS = { access: "letter_access", refresh: "letter_refresh" };

export const tokenStore = {
  getAccess:      ()    => localStorage.getItem(KEYS.access),
  getRefresh:     ()    => localStorage.getItem(KEYS.refresh),
  setTokens:      (a,r) => { localStorage.setItem(KEYS.access, a); localStorage.setItem(KEYS.refresh, r); },
  clearTokens:    ()    => { localStorage.removeItem(KEYS.access); localStorage.removeItem(KEYS.refresh); },
};

// ── Refresh lock (prevent parallel refreshes) ─────────────────────────────────
let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) throw new Error("No refresh token");

    const res = await fetch(`${BASE}/auth/refresh`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      tokenStore.clearTokens();
      throw new Error("Refresh failed");
    }

    const { accessToken, refreshToken: newRefresh } = await res.json();
    tokenStore.setTokens(accessToken, newRefresh);
    return accessToken;
  })().finally(() => { _refreshPromise = null; });

  return _refreshPromise;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(path, options = {}, retry = true) {
  const token = tokenStore.getAccess();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  // Token expired — try once to refresh
  if (res.status === 401 && retry) {
    // Clone before reading body so the original res can still be returned/used
    const cloned = res.clone();
    const body = await cloned.json().catch(() => ({}));
    if (body.code === "TOKEN_EXPIRED") {
      try {
        await refreshAccessToken();
        return apiFetch(path, options, false);
      } catch {
        // Refresh failed — force sign-out
        tokenStore.clearTokens();
        window.dispatchEvent(new Event("letter:signout"));
      }
    }
  }

  return res;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const auth = {
  async signup(email, password, displayName) {
    const res = await apiFetch("/auth/signup", {
      method: "POST",
      body:   JSON.stringify({ email, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign up failed");
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return data.user;
  },

  async signin(email, password) {
    const res = await apiFetch("/auth/signin", {
      method: "POST",
      body:   JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign in failed");
    tokenStore.setTokens(data.accessToken, data.refreshToken);
    return data.user;
  },

  async signout(everywhere = false) {
    const refreshToken = tokenStore.getRefresh();
    // Use raw fetch — access token may be expired at signout time.
    // We don't need auth on this endpoint; the refresh token is the credential.
    await fetch(`${BASE}/auth/signout`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refreshToken, everywhere }),
    }).catch(() => {});
    tokenStore.clearTokens();
  },

  async me() {
    const res  = await apiFetch("/auth/me");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Not authenticated");
    return data.user;
  },

  async updateProfile(patch) {
    const res  = await apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");
    return data.user;
  },
};

// ── Email accounts ────────────────────────────────────────────────────────────
export const accounts = {
  async list() {
    const res  = await apiFetch("/accounts");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.accounts;
  },
  async create(payload) {
    const res  = await apiFetch("/accounts", { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.account;
  },
  async update(id, patch) {
    const res  = await apiFetch(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.account;
  },
  async setDefault(id) {
    const res  = await apiFetch(`/accounts/${id}/default`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.accounts;
  },
  async remove(id) {
    const res  = await apiFetch(`/accounts/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};

// ── Labels ────────────────────────────────────────────────────────────────────
export const labels = {
  async list() {
    const res  = await apiFetch("/labels");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.labels;
  },
  async create(payload) {
    const res  = await apiFetch("/labels", { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.label;
  },
  async update(id, patch) {
    const res  = await apiFetch(`/labels/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.label;
  },
  async remove(id) {
    const res  = await apiFetch(`/labels/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};

// ── Settings ──────────────────────────────────────────────────────────────────
export const settings = {
  async get() {
    const res  = await apiFetch("/settings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.settings;
  },
  async put(settingsObj) {
    const res  = await apiFetch("/settings", { method: "PUT", body: JSON.stringify({ settings: settingsObj }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.settings;
  },
  async patch(partial) {
    const res  = await apiFetch("/settings", { method: "PATCH", body: JSON.stringify({ settings: partial }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.settings;
  },
};

// ── Mail connection ───────────────────────────────────────────────────────────
export const mail = {
  async testConnection(accountId, imap, smtp) {
    const res  = await apiFetch(`/accounts/${accountId}/test`, { method: "POST", body: JSON.stringify({ imap, smtp }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async connect(accountId, payload) {
    const res  = await apiFetch(`/accounts/${accountId}/connect`, { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async sync(accountId) {
    const res  = await apiFetch(`/accounts/${accountId}/sync`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async disconnect(accountId, deleteMessages = false) {
    const res  = await apiFetch(`/accounts/${accountId}/disconnect`, { method: "POST", body: JSON.stringify({ deleteMessages }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async getMessages(params = {}) {
    const qs   = new URLSearchParams(params).toString();
    const res  = await apiFetch(`/messages${qs ? "?" + qs : ""}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
  async updateMessage(id, patch) {
    const res  = await apiFetch(`/messages/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data.message;
  },
  async send(payload) {
    const res  = await apiFetch("/messages/send", { method: "POST", body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};
