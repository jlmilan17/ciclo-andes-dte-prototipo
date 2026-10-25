import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AccesoDenegado } from '@/pages/auth/AccesoDenegado';
import { useAuth, type Rol } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="p-8 text-tinta-600">Cargando…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

/** RF-SEG-02: una ruta no permitida (clic o URL directa) muestra "Acceso denegado". */
export function RequireRole({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.rol)) return <AccesoDenegado />;
  return <>{children}</>;
}
