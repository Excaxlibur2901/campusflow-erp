/**
 * AuthContext — CampusFlow ERP
 *
 * Provides real server-backed authentication.
 *   - Access token is stored in memory only (never localStorage).
 *   - Refresh token lives in an HttpOnly server cookie (not readable by JS).
 *   - login() calls POST /api/auth/login
 *   - logout() calls POST /api/auth/logout
 *   - On mount, silently attempts POST /api/auth/refresh to restore session.
 *   - Exposes refreshToken() for axios/fetch interceptors to use before retrying.
 *
 * SECURITY: No hardcoded credentials. No plaintext passwords. No localStorage tokens.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AuthContext = createContext(null);

const API = (path) => `/api${path}`;

async function apiFetch(path, options = {}) {
  const res = await fetch(API(path), {
    credentials: 'include', // send HttpOnly cookie
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function AuthProvider({ children }) {
  // Access token stored in memory — never in localStorage or sessionStorage
  const accessTokenRef = useRef(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while attempting session restore

  // Expose access token getter for DataContext API calls
  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  /* ── Session restore on page load ───────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const { ok, data } = await apiFetch('/auth/refresh', { method: 'POST' });
        if (!cancelled && ok) {
          accessTokenRef.current = data.accessToken;
          setUser(data.user);
        }
      } catch {
        // No valid session — user stays logged out
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => { cancelled = true; };
  }, []);

  /* ── Proactive token refresh (14-minute cycle for 15-min tokens) ── */
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const { ok, data } = await apiFetch('/auth/refresh', { method: 'POST' });
        if (ok) {
          accessTokenRef.current = data.accessToken;
          setUser(data.user);
        } else {
          // Session expired — force logout
          setUser(null);
          accessTokenRef.current = null;
        }
      } catch {
        // Network error — keep existing token until it expires
      }
    }, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  /* ── login ──────────────────────────────────────────────────────── */
  const login = useCallback(async (email, password) => {
    if (!email?.trim())    return { success: false, error: 'Email address is required.' };
    if (!password?.length) return { success: false, error: 'Password is required.' };

    const { ok, data } = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    if (!ok) return { success: false, error: data.error ?? 'Login failed. Please try again.' };

    accessTokenRef.current = data.accessToken;
    setUser(data.user);
    return { success: true, user: data.user };
  }, []);

  /* ── logout ─────────────────────────────────────────────────────── */
  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessTokenRef.current}` },
      });
    } catch {
      // Best effort — always clear local state
    }
    accessTokenRef.current = null;
    setUser(null);
  }, []);

  /* ── refreshToken (for use by API interceptors) ─────────────────── */
  const refreshToken = useCallback(async () => {
    const { ok, data } = await apiFetch('/auth/refresh', { method: 'POST' });
    if (ok) {
      accessTokenRef.current = data.accessToken;
      setUser(data.user);
      return data.accessToken;
    }
    setUser(null);
    accessTokenRef.current = null;
    return null;
  }, []);

  /* ── changePassword ─────────────────────────────────────────────── */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const { ok, data } = await apiFetch('/auth/change-password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTokenRef.current}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!ok) return { success: false, error: data.error ?? 'Failed to change password.' };
    // Session revoked server-side — force logout
    accessTokenRef.current = null;
    setUser(null);
    return { success: true };
  }, []);

  /* ── registerAccount ────────────────────────────────────────────── */
  const registerAccount = useCallback(async (formData) => {
    const { ok, data: resData } = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(formData),
    });

    if (!ok) return { success: false, error: resData.error ?? 'Registration failed.' };

    accessTokenRef.current = resData.accessToken;
    setUser(resData.user);
    return { success: true, user: resData.user };
  }, []);

  /* ── fetchInstitutions ───────────────────────────────────────────── */
  const fetchInstitutions = useCallback(async () => {
    const { ok, data } = await apiFetch('/auth/institutions');
    if (ok && Array.isArray(data)) return data;
    return [];
  }, []);

  /* ── First-run setup (called from SetupWizard) ──────────────────── */
  const runSetup = useCallback(async ({ institutionName, adminName, adminEmail, adminPassword }) => {
    const { ok, data } = await apiFetch('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ institutionName, adminName, adminEmail, adminPassword }),
    });
    if (!ok) return { success: false, error: data.error ?? 'Setup failed.' };
    return { success: true };
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    registerAccount,
    fetchInstitutions,
    refreshToken,
    changePassword,
    runSetup,
    getAccessToken,
    isAuthenticated: !!user,
    // Role helpers
    isSuperAdmin: user?.roles?.includes('SUPER_ADMIN') ?? false,
    isPrincipal:  user?.roles?.includes('PRINCIPAL')   ?? false,
    isHOD:        user?.roles?.includes('HOD')         ?? false,
    isFaculty:    user?.roles?.includes('FACULTY')     ?? false,
    isExamCell:   user?.roles?.includes('EXAM_CELL')   ?? false,
    isStudent:    user?.roles?.includes('STUDENT')     ?? false,
  };

  // Show nothing while checking existing session to avoid login flicker
  if (loading) {
    return (
      <AuthContext.Provider value={value}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary, #0f172a)', color: '#94a3b8', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>
            <div>CampusFlow ERP</div>
            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>Restoring session…</div>
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
