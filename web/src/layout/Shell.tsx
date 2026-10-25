import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Chip } from '@/components/Chip';
import { useCaja } from '@/hooks/useCaja';
import { usePublicConfig } from '@/pages/auth/Login';
import { RealtimeProvider } from '@/realtime/RealtimeContext';
import { ConexionMh, InterruptorCaida } from './ConexionMh';
import { Rail } from './Rail';
import { ShellCtx } from './shellContext';
import { SimPanel } from './SimPanel';
import { TopBar } from './TopBar';

export function Shell() {
  const cfg = usePublicConfig();
  const [panel, setPanel] = useState(false);
  const caja = useCaja();
  const turno = caja.data?.turno ?? null;
  const { user } = useAuth();
  const loc = useLocation();
  // Regla 7 / 10.1-5: el Cajero sin turno abierto tiene la terminal bloqueada.
  const bloqueada = user?.rol === 'CAJERO' && !!caja.data && !turno;
  const libres = [
    '/caja/apertura',
    '/caja/cerrada',
    '/perfil',
    '/acerca-simulacion',
    '/consola-mh',
  ];
  const redirigir = bloqueada && !!caja.data?.ultimoCierre && !libres.includes(loc.pathname);
  return (
    <RealtimeProvider>
      <ShellCtx.Provider
        value={{ turnoAbierto: !!turno, cajaCodigo: caja.data?.caja.codigo ?? null }}
      >
        <div className="flex h-screen overflow-hidden">
          <Rail locked={bloqueada} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              left={
                <>
                  {caja.data && (
                    <Chip tone={turno ? 'exito' : 'neutro'} testId="chip-caja">
                      {caja.data.caja.codigo} {turno ? 'ABIERTA' : 'CERRADA'}
                      {turno && <span className="font-normal">· {turno.cajero}</span>}
                    </Chip>
                  )}
                  <ConexionMh />
                </>
              }
              right={
                cfg.data?.demoMode && (
                  <>
                    <InterruptorCaida />
                    <button
                      type="button"
                      aria-label="Panel de simulación"
                      title="Panel de simulación (demostración)"
                      data-testid="abrir-panel-sim"
                      onClick={() => setPanel(true)}
                      className="flex h-8 w-8 items-center justify-center rounded-control border border-borde text-tinta-600 hover:bg-papel-50"
                    >
                      ⚙
                    </button>
                  </>
                )
              }
            />
            <main className="min-h-0 flex-1 overflow-auto">
              {redirigir ? <Navigate to="/caja/cerrada" replace /> : <Outlet />}
            </main>
          </div>
        </div>
        {panel && <SimPanel onClose={() => setPanel(false)} />}
      </ShellCtx.Provider>
    </RealtimeProvider>
  );
}
