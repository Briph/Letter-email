/**
 * src/AuthContext.jsx
 * Provides { user, loading, signIn, signUp, signOut, refreshUser }
 * to the entire app via React context.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { auth as authApi, tokenStore } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children, onUserReady }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);   // true while restoring session
  const [error,   setError]   = useState(null);

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const token = tokenStore.getAccess();
    if (!token) { setLoading(false); return; }

    authApi.me()
      .then(u => { setUser(u); onUserReady?.(u); })
      .catch(() => { tokenStore.clearTokens(); })
      .finally(() => setLoading(false));
  }, []);

  // ── Listen for forced sign-out (token refresh failure) ────────────────────
  useEffect(() => {
    const handler = () => { setUser(null); };
    window.addEventListener("letter:signout", handler);
    return () => window.removeEventListener("letter:signout", handler);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email, password) => {
    setError(null);
    try {
      const u = await authApi.signin(email, password);
      setUser(u);
      return u;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signUp = useCallback(async (email, password, displayName) => {
    setError(null);
    try {
      const u = await authApi.signup(email, password, displayName);
      setUser(u);
      return u;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const signOut = useCallback(async (everywhere = false) => {
    await authApi.signout(everywhere);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await authApi.me();
    setUser(u);
    return u;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
