import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { JsonViewer } from '@/components/JsonViewer';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { Modal } from '@/components/Modal';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { Table, Td, Tr } from '@/components/Table';
import { useToast } from '@/components/Toast';
import { dateTime, money } from '@/lib/format';
import { TIPO_DTE } from '@/pages/clientes/ClienteFicha';
import { useRealtime } from '@/realtime/RealtimeContext';

type Bandeja = {
  pendientes: number;
  batchMax: number;
  pollSeconds: number;
  mh: { online: boolean; checkedAt: string };
  cola: Array<{
    id: string;
    tipo: string;
    numero_control: string;
    emitido_at: string;
    intentos_transmision: number;
    receptor: { razon_social: string };
    total: number;
  }>;
  lotes: Array<{
    id: string;
    created_at: string;
    estado: string;
    documentos: number;
    origen: string;
    procesados: number;
    rechazados: number;
  }>;
};

/** Bandeja de contingencia (RF-LOT-01/02/03): cola, lotes y acciones del Administrador. */
export function Contingencia() {
  const { user } = useAuth();
  const admin = user?.rol === 'ADMIN';
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { online } = useRealtime();
  const [lote, setLote] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['contingencia'],
    queryFn: () => api<Bandeja>('/contingencia'),
    refetchInterval: 10_000,
  });

  const probar = useMutation({
    mutationFn: () => api<{ online: boolean }>('/contingencia/probar-conexion', { method: 'POST' }),
    onSuccess: (r) =>
      toast(
        r.online ? 'Conexión con el MH: en línea.' : 'El MH sigue sin responder.',
        r.online ? 'exito' : 'aviso',
      ),
  });
  const transmitir = useMutation({
    mutationFn: () =>
      api<{ online: boolean; lotes: Array<{ procesados: number; rechazados: number }> }>(
        '/contingencia/transmitir',
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['contingencia'] });
      if (!r.online) toast('Sin conexión con el MH: el lote no se pudo transmitir.', 'aviso');
      else {
        const p = r.lotes.reduce((a, l) => a + l.procesados, 0);
        const x = r.lotes.reduce((a, l) => a + l.rechazados, 0);
        toast(
          r.lotes.length
            ? `Lote transmitido: ${p} procesados, ${x} rechazados.`
            : 'No había documentos pendientes.',
          'exito',
        );
      }
    },
  });

  return (
    <div className="p-6">
      <SectionTitle
        actions={
          admin && (
            <>
              <Button
                variant="secondary"
                onClick={() => probar.mutate()}
                disabled={probar.isPending}
              >
                Probar conexión
              </Button>
              <Button
                onClick={() => transmitir.mutate()}
                disabled={transmitir.isPending || !data?.pendientes}
                data-testid="transmitir-lote"
              >
                Transmitir lote ahora
              </Button>
            </>
          )
        }
      >
        Contingencia
      </SectionTitle>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-tinta-600">Conexión con el MH</p>
          <p className="mt-2">
            <Chip tone={online ? 'exito' : 'aviso'}>
              {online ? 'MH EN LÍNEA' : 'MH SIN CONEXIÓN'}
            </Chip>
          </p>
          <p className="mt-2 text-xs text-tinta-600">
            Monitor cada {data?.pollSeconds ?? '—'} s; al volver la conexión transmite solo.
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-tinta-600">DTE pendientes</p>
          <p className="num mt-1 text-2xl" data-testid="bandeja-pendientes">
            {data?.pendientes ?? 0}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wide text-tinta-600">Límite por lote</p>
          <p className="num mt-1 text-2xl">{data?.batchMax ?? '—'}</p>
          <SupuestoDemo zg="ZG-08">valor provisional, pendiente de validar.</SupuestoDemo>
        </Card>
      </div>

      <h2 className="mb-2 font-cond text-lg font-semibold">Cola de documentos</h2>
      <Table
        head={['Tipo', 'Número de control', 'Receptor', 'Emitido', 'Intentos', 'Total', 'Estado']}
      >
        {data?.cola.map((d) => (
          <Tr key={d.id} onClick={() => nav(`/dte/${d.id}`)}>
            <Td>{TIPO_DTE[d.tipo]}</Td>
            <Td className="num">{d.numero_control}</Td>
            <Td>{d.receptor.razon_social}</Td>
            <Td>{dateTime(d.emitido_at)}</Td>
            <Td num>{d.intentos_transmision}</Td>
            <Td num>{money(d.total)}</Td>
            <Td>
              <EstadoDte estado="ENCOLADO" />
            </Td>
          </Tr>
        ))}
        {data?.cola.length === 0 && (
          <Tr>
            <Td colSpan={7} className="py-6 text-center text-tinta-600">
              No hay documentos en contingencia.
            </Td>
          </Tr>
        )}
      </Table>

      <h2 className="mb-2 mt-8 font-cond text-lg font-semibold">Lotes transmitidos</h2>
      <Table head={['Lote', 'Fecha', 'Origen', 'Documentos', 'Procesados', 'Rechazados', 'Estado']}>
        {data?.lotes.map((l) => (
          <Tr key={l.id} onClick={() => setLote(l.id)}>
            <Td className="num">{l.id.slice(0, 8).toUpperCase()}</Td>
            <Td>{dateTime(l.created_at)}</Td>
            <Td>{l.origen === 'MANUAL' ? 'Manual' : 'Automático'}</Td>
            <Td num>{l.documentos}</Td>
            <Td num>{l.procesados}</Td>
            <Td num>{l.rechazados}</Td>
            <Td>
              <Chip
                tone={
                  l.estado === 'PROCESADO' ? 'exito' : l.estado === 'FALLIDO' ? 'aviso' : 'neutro'
                }
              >
                {l.estado}
              </Chip>
            </Td>
          </Tr>
        ))}
        {data?.lotes.length === 0 && (
          <Tr>
            <Td colSpan={7} className="py-6 text-center text-tinta-600">
              Aún no se han transmitido lotes.
            </Td>
          </Tr>
        )}
      </Table>
      {lote && <LoteDetalle id={lote} onClose={() => setLote(null)} />}
    </div>
  );
}

type Lote = {
  id: string;
  estado: string;
  json: unknown;
  respuesta: unknown;
  docs: Array<{
    id: string;
    tipo: string;
    numero_control: string;
    estado: Estado;
    sello_recepcion: string | null;
  }>;
};

function LoteDetalle({ id, onClose }: { id: string; onClose: () => void }) {
  const nav = useNavigate();
  const { data } = useQuery({
    queryKey: ['lote-contingencia', id],
    queryFn: () => api<Lote>(`/contingencia/lotes/${id}`),
  });
  return (
    <Modal open width="max-w-4xl" title={`Lote ${id.slice(0, 8).toUpperCase()}`} onClose={onClose}>
      {data && (
        <div className="flex flex-col gap-4 text-sm">
          <ul className="divide-y divide-borde rounded-card border border-borde">
            {data.docs.map((d) => (
              <li
                key={d.id}
                className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-papel-50"
                onClick={() => nav(`/dte/${d.id}`)}
              >
                <span className="num">{d.numero_control}</span>
                <span className="num truncate px-3 text-xs text-tinta-600">
                  {d.sello_recepcion ?? '—'}
                </span>
                <EstadoDte estado={d.estado} />
              </li>
            ))}
          </ul>
          <section>
            <h3 className="mb-1 font-cond font-semibold">JSON de lote enviado</h3>
            <JsonViewer value={data.json} maxHeight="max-h-64" testId="json-lote" />
          </section>
          <section>
            <h3 className="mb-1 font-cond font-semibold">Respuesta del MH por documento</h3>
            <JsonViewer value={data.respuesta} maxHeight="max-h-64" />
          </section>
        </div>
      )}
    </Modal>
  );
}
