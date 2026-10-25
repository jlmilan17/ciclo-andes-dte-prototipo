import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';

/** RF-SEG-03: overlay que fuerza el reingreso cuando el token expira. */
export function SesionExpirada() {
  const { expired, clearExpired } = useAuth();
  const nav = useNavigate();
  if (!expired) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-tinta-900/60"
      role="alertdialog"
      aria-label="Sesión expirada"
    >
      <div className="w-full max-w-sm rounded-card bg-superficie p-6 text-center shadow-2xl">
        <h2 className="font-cond text-xl font-semibold">Sesión expirada</h2>
        <p className="mt-2 text-sm text-tinta-600">
          Por seguridad, su sesión terminó. Vuelva a iniciar sesión para continuar.
        </p>
        <Button
          className="mt-5"
          onClick={() => {
            clearExpired();
            nav('/login', { replace: true });
          }}
        >
          Iniciar sesión de nuevo
        </Button>
      </div>
    </div>
  );
}
