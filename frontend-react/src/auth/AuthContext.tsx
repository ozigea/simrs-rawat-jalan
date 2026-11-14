import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tokenStore, yiiApi, type ApiEnvelope } from '../api/client';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  staff_id: number | null;
  roles: string[];
  permissions: string[];
}

interface LoginData {
  access_token: string;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!tokenStore.get());

  // Restore the session from a stored token; the server is the source of truth for roles.
  useEffect(() => {
    if (!tokenStore.get()) return;
    yiiApi
      .get<ApiEnvelope<AuthUser>>('/auth/me')
      .then((r) => setUser(r.data.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const r = await yiiApi.post<ApiEnvelope<LoginData>>('/auth/login', { username, password });
    tokenStore.set(r.data.data!.access_token);
    setUser(r.data.data!.user);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, can: (p) => !!user?.permissions.includes(p) }),
    [user, loading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
