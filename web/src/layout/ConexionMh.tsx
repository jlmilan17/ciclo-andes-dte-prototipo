import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Chip } from '@/components/Chip';
import { cx } from '@/components/cx';
import { useToast } from '@/components/Toast';
import { useRealtime } from '@/realtime/RealtimeContext';

export type SimEstado = {
  sim: {
    modo: 'EN_LINEA' | 'SIN_CONEXION' | 'LENTA';
    latencia_ms: number;
    rechazar_proximo: string | null;
  } | null;
  simDisponible: boolean;
  pendientes: number;
};

export const useSimEstado = () =>
  useQuery({ queryKey: ['sim-estado'], queryFn: () => api<SimEstado>('/sim/estado') });

/** Chip de conexión con el MH y contador de DTE pendientes (10.1-3). */
export function ConexionMh() {
  const { online, pendientes } = useRealtime();
  return (
    <Chip tone={online ? 'exito' : 'aviso'} testId="chip-mh">
      <span className={cx('h-2 w-2 rounded-full', online ? 'bg-sello-600' : 'bg-ambar-600')} />
      {online ? 'MH EN LÍNEA' : 'MH SIN CONEXIÓN'}
      <span className="num" data-testid="contador-cola" title="DTE pendientes en contingencia">
        · {pendientes} pend.
      </span>
    </Chip>
  );
}

/** PRT-SIM-02: interruptor de demostración visible para ambos roles. */
export function InterruptorCaida() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useSimEstado();
  const caido = data?.sim?.modo === 'SIN_CONEXION';
  const m = useMutation({
    mutationFn: (modo: string) => api<SimEstado>('/sim/estado', { body: { modo } }),
    onSuccess: (r) => qc.setQueryData(['sim-estado'], r),
    onError: (e) => toast(e.message, 'error'),
  });
  return (
    <label
      className="flex cursor-pointer items-center gap-2 rounded-control border border-dashed border-ambar-600/60 px-2.5 py-1 text-xs text-tinta-600"
      title="Herramienta de demostración"
    >
      <span className="font-medium text-ambar-600">DEMO</span>
      Simular caída de conexión MH
      <button
        type="button"
        role="switch"
        aria-checked={caido}
        aria-label="Simular caída de conexión MH"
        data-testid="toggle-caida"
        disabled={!data?.simDisponible || m.isPending}
        onClick={() => m.mutate(caido ? 'EN_LINEA' : 'SIN_CONEXION')}
        className={cx(
          'relative h-5 w-9 rounded-full transition-colors disabled:opacity-50',
          caido ? 'bg-ambar-600' : 'bg-borde',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            caido ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}
