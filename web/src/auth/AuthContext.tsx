import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { SESSION_EXPIRED_EVENT, api, tokenStore } from '@/api/client';

export type Rol = 'CAJERO' | 'ADMIN';
export type User = { id: string; nombre: string; correo: string; rol: Rol; cajaId: string | null };
type Session = { token: string; user: User };

type Ctx = {
  user: User | null;
  ready: boolean;
  expired: boolean;
  login: (correo: string, password: string) => Promise<User>;
  demoRole: (rol: Rol) => Promise<User>;
  logout: () => Promise<void>;
  clearExpired: () => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onExpired = () => {
      if (tokenStore.get()) setExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const start = useCallback(
    (s: Session) => {
      qc.clear();
      tokenStore.set(s.token);
      setExpired(false);
      setUser(s.user);
      return s.user;
    },
    [qc],
  );

  const login = useCallback(
    async (correo: string, password: string) =>
      start(await api<Session>('/auth/login', { body: { correo, password } })),
    [start],
  );
  const demoRole = useCallback(
    async (rol: Rol) => start(await api<Session>('/auth/demo-role', { body: { rol } })),
    [start],
  );
  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* la sesión puede haber expirado */
    }
    tokenStore.set(null);
    qc.clear();
    setUser(null);
  }, [qc]);
  const clearExpired = useCallback(() => {
    tokenStore.set(null);
    qc.clear();
    setExpired(false);
    setUser(null);
  }, [qc]);

  return (
    <AuthCtx.Provider value={{ user, ready, expired, login, demoRole, logout, clearExpired }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

export const homeFor = (rol: Rol) => (rol === 'ADMIN' ? '/resumen' : '/pos');
