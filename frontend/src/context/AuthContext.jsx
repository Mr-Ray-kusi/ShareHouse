import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { setAccessToken, getAccessToken } from '../api/client';

const AuthContext = createContext(null);
const SESSION_KEY = 'ws_session';

function readCachedSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : { user: null, tenant: null };
  } catch {
    return { user: null, tenant: null };
  }
}

function writeCachedSession(user, tenant) {
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, tenant: tenant || null }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const cached = readCachedSession();
  const [user, setUser] = useState(cached.user);
  const [tenant, setTenant] = useState(cached.tenant);
  const [loading, setLoading] = useState(!cached.user);

  function applySession(data) {
    if (data?.accessToken) setAccessToken(data.accessToken);
    if (data?.user) setUser(data.user);
    if (data?.tenant !== undefined) setTenant(data.tenant);
    if (data?.user) writeCachedSession(data.user, data.tenant);
  }

  async function bootstrap() {
    try {
      if (!getAccessToken()) {
        const { data } = await api.post('/api/auth/refresh');
        applySession(data);
        if (data?.user) {
          setLoading(false);
          return;
        }
      }
      const { data } = await api.get('/api/auth/me');
      setUser(data.user);
      setTenant(data.tenant);
      writeCachedSession(data.user, data.tenant);
    } catch (_err) {
      setAccessToken(null);
      setUser(null);
      setTenant(null);
      writeCachedSession(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    bootstrap();
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/api/auth/login', { email, password });
    applySession(data);
    return data;
  }

  async function register(payload) {
    const { data } = await api.post('/api/auth/register', payload);
    if (data?.accessToken) applySession(data);
    return data;
  }

  async function joinAssistant(code, name, password) {
    const { data } = await api.post(`/api/auth/join/${code}`, { name, password });
    applySession(data);
    return data;
  }

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch (_err) {
      /* ignore */
    }
    setAccessToken(null);
    setUser(null);
    setTenant(null);
    writeCachedSession(null);
  }

  async function refreshMe() {
    const { data } = await api.get('/api/auth/me');
    setUser(data.user);
    setTenant(data.tenant);
    writeCachedSession(data.user, data.tenant);
    return data;
  }

  const value = useMemo(
    () => ({
      user,
      tenant,
      supportMode: false,
      loading,
      login,
      register,
      joinAssistant,
      logout,
      refreshMe,
      applySession,
    }),
    [user, tenant, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
