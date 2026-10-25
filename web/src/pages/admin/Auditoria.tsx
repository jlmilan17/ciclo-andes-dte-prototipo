import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Card';
import { Select } from '@/components/Input';
import { Table, Td, Tr } from '@/components/Table';
import { dateTime } from '@/lib/format';

type Fila = {
  id: number;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  detalle: unknown;
  created_at: string;
  usuario: string | null;
};

const ACCIONES = [
  'LOGIN',
  'LOGIN_FALLIDO',
  'CUENTA_BLOQUEADA',
  'CUENTA_DESBLOQUEADA',
  'VENTA_EMITIDA',
  'DTE_INVALIDADO',
  'NCE_EMITIDA',
  'CORTE_Z',
  'TRANSMITIR_LOTE',
  'SIM_MODO_CONEXION',
];

/** Registro de auditoría de solo inserción (PRT-SEG-05). */
export function Auditoria() {
  const [accion, setAccion] = useState('');
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ['auditoria', accion, page],
    queryFn: () =>
      api<{ items: Fila[] }>(`/auditoria?page=${page}${accion ? `&accion=${accion}` : ''}`),
  });
  return (
    <div className="p-6">
      <SectionTitle>Auditoría</SectionTitle>
      <p className="mb-4 text-sm text-tinta-600">
        Bitácora inmutable: la base de datos rechaza cualquier UPDATE o DELETE sobre estos
        registros.
      </p>
      <Select
        aria-label="Acción"
        className="mb-4 w-72"
        value={accion}
        onChange={(e) => {
          setAccion(e.target.value);
          setPage(1);
        }}
      >
        <option value="">Todas las acciones</option>
        {ACCIONES.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </Select>
      <div className="mt-4">
        <Table head={['Fecha', 'Usuario', 'Acción', 'Entidad', 'Detalle']}>
          {data?.items.map((x) => (
            <Tr key={x.id}>
              <Td className="whitespace-nowrap">{dateTime(x.created_at)}</Td>
              <Td>{x.usuario ?? '—'}</Td>
              <Td className="num text-xs">{x.accion}</Td>
              <Td className="text-xs text-tinta-600">{x.entidad ?? ''}</Td>
              <Td className="num max-w-md truncate text-xs text-tinta-600">
                {x.detalle ? JSON.stringify(x.detalle) : ''}
              </Td>
            </Tr>
          ))}
        </Table>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Anterior
        </Button>
        <Button
          variant="secondary"
          disabled={(data?.items.length ?? 0) < 50}
          onClick={() => setPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
