import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokenStore } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

type State = { online: boolean; modo: string | null; pendientes: number; conectado: boolean };
const Ctx = createContext<State>({ online: true, modo: null, pendientes: 0, conectado: false });

/** Suscripción SSE: el interruptor del MH y el contador de cola afectan a todas las pantallas. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [s, setS] = useState<State>({ online: true, modo: null, pendientes: 0, conectado: false });

  useEffect(() => {
    const token = tokenStore.get();
    if (!user || !token) return;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setS((x) => ({ ...x, conectado: true }));
    es.onerror = () => setS((x) => ({ ...x, conectado: false }));
    es.onmessage = (m) => {
      const e = JSON.parse(m.data);
      if (e.type === 'mh') {
        setS((x) => ({ ...x, online: e.online, modo: e.modo ?? x.modo }));
        qc.invalidateQueries({ queryKey: ['sim-estado'] });
      } else if (e.type === 'cola') {
        setS((x) => ({ ...x, pendientes: e.pendientes }));
        qc.invalidateQueries({ queryKey: ['contingencia'] });
      } else if (e.type === 'dte' || e.type === 'lote') {
        qc.invalidateQueries({ queryKey: ['dte'] });
        qc.invalidateQueries({ queryKey: ['contingencia'] });
        qc.invalidateQueries({ queryKey: ['consola'] });
        qc.invalidateQueries({ queryKey: ['resumen'] });
      } else if (e.type === 'reset') {
        qc.invalidateQueries();
      }
    };
    return () => es.close();
  }, [user, qc]);

  return <Ctx.Provider value={s}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
