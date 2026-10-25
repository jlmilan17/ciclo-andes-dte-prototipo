import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useSimEstado, type SimEstado } from './ConexionMh';

type Codigo = { codigo: string; descripcion: string };

/** PRT-SIM-03: panel de simulación (herramienta de demostración). */
export function SimPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useSimEstado();
  const codigos = useQuery({
    queryKey: ['codigos-rechazo'],
    queryFn: () => api<Codigo[]>('/sim/codigos-rechazo'),
  });
  const [latencia, setLatencia] = useState(String(data?.sim?.latencia_ms ?? 5000));
  const [codigo, setCodigo] = useState('RCH-007');
  const [confirmReset, setConfirmReset] = useState(false);

  const modo = useMutation({
    mutationFn: (m: string) =>
      api<SimEstado>('/sim/estado', { body: { modo: m, latencia_ms: Number(latencia) || 0 } }),
    onSuccess: (r) => qc.setQueryData(['sim-estado'], r),
    onError: (e) => toast(e.message, 'error'),
  });
  const rechazar = useMutation({
    mutationFn: (c: string | null) => api('/sim/rechazar-proximo', { body: { codigo: c } }),
    onSuccess: (_r, c) => {
      qc.invalidateQueries({ queryKey: ['sim-estado'] });
      toast(
        c ? `El próximo documento será rechazado con ${c}.` : 'Rechazo forzado cancelado.',
        'info',
      );
    },
  });
  const expirar = useMutation({
    mutationFn: () => api('/sim/expirar-sesion', { method: 'POST' }),
    onSuccess: () => {
      onClose();
      // La siguiente llamada al API devuelve 401 y muestra el overlay "Sesión expirada".
      void api('/auth/me').catch(() => undefined);
    },
  });
  const cargar = useMutation({
    mutationFn: () =>
      api<{ ventas: Array<{ estado: string }> }>('/sim/cargar-ventas', { body: { cantidad: 6 } }),
    onSuccess: (r) => {
      qc.invalidateQueries();
      const enc = r.ventas.filter((v) => v.estado === 'ENCOLADO').length;
      toast(
        `${r.ventas.length} ventas de demostración emitidas${enc ? ` (${enc} en contingencia)` : ''}.`,
        'exito',
      );
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const reset = useMutation({
    mutationFn: () => api('/sim/reset', { method: 'POST' }),
    onSuccess: () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('ca.carrito'))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* sin almacenamiento */
      }
      qc.invalidateQueries();
      toast('Datos de demostración restablecidos.', 'exito');
      onClose();
    },
  });

  const actual = data?.sim?.modo;
  const opcion = (m: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="modo"
        checked={actual === m}
        onChange={() => modo.mutate(m)}
        disabled={modo.isPending}
      />
      {label}
    </label>
  );

  return (
    <Modal side open title="Panel de simulación" onClose={onClose}>
      <p className="mb-4 rounded-control border border-dashed border-ambar-600 bg-ambar-100 px-3 py-2 text-xs text-ambar-600">
        Herramienta de demostración. El Ministerio de Hacienda es un simulador local; nada sale de
        esta máquina.
      </p>
      {!data?.simDisponible && (
        <p className="mb-4 text-sm text-granate-600">El simulador del MH no está en ejecución.</p>
      )}

      <Card className="mb-4 flex flex-col gap-3 p-4">
        <h3 className="font-cond font-semibold">Conexión con el MH</h3>
        {opcion('EN_LINEA', 'En línea')}
        {opcion('SIN_CONEXION', 'Sin conexión')}
        <div className="flex items-end gap-3">
          {opcion('LENTA', 'Lenta')}
          <Input
            aria-label="Latencia en milisegundos"
            mono
            className="w-28"
            value={latencia}
            onChange={(e) => setLatencia(e.target.value)}
          />
          <span className="pb-2 text-xs text-tinta-600">
            ms (más de 3000 activa contingencia por timeout)
          </span>
        </div>
      </Card>

      <Card className="mb-4 flex flex-col gap-3 p-4">
        <h3 className="font-cond font-semibold">Rechazar el próximo documento</h3>
        <Select
          aria-label="Código de rechazo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        >
          {codigos.data?.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo} · {c.descripcion}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => rechazar.mutate(codigo)}>
            Rechazar el próximo
          </Button>
          {data?.sim?.rechazar_proximo && (
            <Button variant="ghost" onClick={() => rechazar.mutate(null)}>
              Cancelar ({data.sim.rechazar_proximo})
            </Button>
          )}
        </div>
      </Card>

      <Card className="mb-4 flex flex-col gap-2 p-4">
        <h3 className="font-cond font-semibold">Sesión y datos</h3>
        <Button variant="secondary" onClick={() => expirar.mutate()}>
          Expirar sesión ahora
        </Button>
        <Button variant="secondary" onClick={() => cargar.mutate()} disabled={cargar.isPending}>
          {cargar.isPending ? 'Emitiendo ventas…' : 'Cargar ventas de demostración del turno'}
        </Button>
        {confirmReset ? (
          <div className="rounded-control border border-granate-600/40 bg-granate-100 p-3 text-sm">
            <p className="mb-2 text-granate-600">
              Se borrarán todas las ventas, DTE y cambios. ¿Continuar?
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => reset.mutate()} disabled={reset.isPending}>
                Sí, restablecer
              </Button>
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Restablecer datos de demostración
          </Button>
        )}
      </Card>

      <div className="flex flex-col gap-1 text-sm">
        <Link className="text-sello-600 underline" to="/consola-mh" onClick={onClose}>
          Consola del MH
        </Link>
        <Link className="text-sello-600 underline" to="/acerca-simulacion" onClick={onClose}>
          Acerca de la simulación
        </Link>
      </div>
    </Modal>
  );
}
