import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { SectionTitle } from '@/components/Card';
import { Chip, type Tone } from '@/components/Chip';
import { JsonViewer } from '@/components/JsonViewer';
import { Modal } from '@/components/Modal';
import { Table, Td, Tr } from '@/components/Table';
import { dateTime } from '@/lib/format';

type Fila = {
  id: number;
  endpoint: string;
  http_status: number | null;
  resultado: string;
  latencia_ms: number;
  created_at: string;
  numero_control: string | null;
  lote_id: string | null;
};

const TONO: Record<string, Tone> = {
  OK: 'exito',
  RECHAZO: 'error',
  SIN_CONEXION: 'aviso',
  TIMEOUT: 'aviso',
};

function decodeJws(jws: string) {
  const [h, p] = jws.split('.');
  const dec = (s: string) => JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
  try {
    return { header: dec(h!), payload: dec(p!) };
  } catch {
    return null;
  }
}

/** PRT-SIM-04: cada intercambio con el simulador del MH, en orden cronológico. */
export function ConsolaMh() {
  const [sel, setSel] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ['consola'],
    queryFn: () => api<{ items: Fila[] }>('/sim/consola'),
    refetchInterval: 5000,
  });
  return (
    <div className="p-6">
      <SectionTitle>Consola del MH (simulado)</SectionTitle>
      <p className="mb-4 text-sm text-tinta-600">
        Lo que ocurre detrás de cada emisión: petición, JSON firmado (JWS), respuesta, sello y
        latencia. El receptor es el simulador local del Ministerio de Hacienda.
      </p>
      <Table head={['Hora', 'Endpoint', 'Documento', 'Resultado', 'HTTP', 'Latencia']}>
        {data?.items.map((x) => (
          <Tr key={x.id} onClick={() => setSel(x.id)}>
            <Td className="whitespace-nowrap">{dateTime(x.created_at)}</Td>
            <Td className="num">POST {x.endpoint}</Td>
            <Td className="num">
              {x.numero_control ??
                (x.lote_id ? `Lote ${x.lote_id.slice(0, 8).toUpperCase()}` : '—')}
            </Td>
            <Td>
              <Chip tone={TONO[x.resultado] ?? 'neutro'}>{x.resultado.replace('_', ' ')}</Chip>
            </Td>
            <Td num>{x.http_status ?? '—'}</Td>
            <Td num>{x.latencia_ms} ms</Td>
          </Tr>
        ))}
        {data?.items.length === 0 && (
          <Tr>
            <Td colSpan={6} className="py-6 text-center text-tinta-600">
              Aún no hay intercambios con el MH.
            </Td>
          </Tr>
        )}
      </Table>
      {sel !== null && <DetalleIntercambio id={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

type Detalle = Fila & {
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  codigo_generacion: string | null;
};

function DetalleIntercambio({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: x } = useQuery({
    queryKey: ['consola', id],
    queryFn: () => api<Detalle>(`/sim/consola/${id}`),
  });
  const jws = typeof x?.request?.documento === 'string' ? (x.request.documento as string) : null;
  const decoded = jws ? decodeJws(jws) : null;
  return (
    <Modal open width="max-w-4xl" title={`Intercambio #${id}`} onClose={onClose}>
      {x && (
        <div className="flex flex-col gap-4 text-sm">
          <p className="num">
            POST {x.endpoint} · {x.resultado} · HTTP {x.http_status ?? '—'} · {x.latencia_ms} ms
          </p>
          <section>
            <h3 className="mb-1 font-cond font-semibold">Petición</h3>
            <JsonViewer value={x.request} maxHeight="max-h-48" />
          </section>
          {decoded && (
            <section>
              <h3 className="mb-1 font-cond font-semibold">JSON firmado (carga útil del JWS)</h3>
              <JsonViewer value={decoded} maxHeight="max-h-72" />
            </section>
          )}
          <section>
            <h3 className="mb-1 font-cond font-semibold">Respuesta del MH</h3>
            <JsonViewer value={x.response} maxHeight="max-h-72" />
          </section>
        </div>
      )}
    </Modal>
  );
}
