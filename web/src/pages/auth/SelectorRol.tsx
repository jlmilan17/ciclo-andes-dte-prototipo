import { Navigate, useNavigate } from 'react-router-dom';
import { MODULOS_POR_ROL } from '@/auth/nav';
import { homeFor, useAuth, type Rol } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { usePublicConfig } from './Login';

const ROLES: Array<{ rol: Rol; titulo: string; persona: string }> = [
  { rol: 'CAJERO', titulo: 'Cajero', persona: 'José Luis Hernández · Caja 01' },
  { rol: 'ADMIN', titulo: 'Administrador', persona: 'Daniela Reina' },
];

/** PRT-SEG-03: pantalla separada del login real, visible solo con DEMO_MODE. */
export function SelectorRol() {
  const { demoRole } = useAuth();
  const nav = useNavigate();
  const cfg = usePublicConfig();
  if (cfg.data && !cfg.data.demoMode) return <Navigate to="/login" replace />;

  const go = async (rol: Rol) => {
    const u = await demoRole(rol);
    nav(homeFor(u.rol), { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-papel-50 p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6 rounded-control border border-dashed border-ambar-600 bg-ambar-100 px-4 py-2 text-center text-sm text-ambar-600">
          Herramienta de demostración · no forma parte del sistema en producción
        </div>
        <h1 className="mb-6 text-center font-cond text-2xl font-semibold">
          Explorar el prototipo como…
        </h1>
        <div className="grid grid-cols-2 gap-6">
          {ROLES.map((r) => (
            <Card key={r.rol} className="flex flex-col p-6">
              <h2 className="font-cond text-xl font-semibold">{r.titulo}</h2>
              <p className="text-sm text-tinta-600">{r.persona}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-pizarra-400">
                Módulos que ve
              </p>
              <ul className="mt-2 flex-1 list-inside list-disc text-sm">
                {MODULOS_POR_ROL[r.rol].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <Button className="mt-6" onClick={() => go(r.rol)}>
                Entrar como {r.titulo}
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center">
          <Button variant="ghost" onClick={() => nav('/login')}>
            Volver
          </Button>
        </p>
      </div>
    </div>
  );
}
