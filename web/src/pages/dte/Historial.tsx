import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { SectionTitle } from '@/components/Card';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { Input, Select } from '@/components/Input';
import { Pagination } from '@/components/Pagination';
import { Table, Td, Tr } from '@/components/Table';
import { useDebounced } from '@/hooks/useDebounced';
import { dateTime, money } from '@/lib/format';
import { TIPO_DTE } from '@/pages/clientes/ClienteFicha';

type Fila = {
  id: string;
  tipo: string;
  numero_control: string;
  estado: Estado;
  emitido_at: string;
  receptor: { razon_social: string };
  total: number;
};

/** Historial de DTE con filtros reales (servidor). */
export function Historial() {
  const nav = useNavigate();
  const [f, setF] = useState({ q: '', tipo: '', estado: '', desde: '', hasta: '' });
  const [page, setPage] = useState(1);
  const dq = useDebounced(f.q, 250);
  const qs = new URLSearchParams({ page: String(page) });
  if (dq) qs.set('q', dq);
  for (const k of ['tipo', 'estado', 'desde', 'hasta'] as const) if (f[k]) qs.set(k, f[k]);
  const { data } = useQuery({
    queryKey: ['dte', 'lista', qs.toString()],
    queryFn: () =>
      api<{ items: Fila[]; total: number; page: number; pageSize: number }>(`/dte?${qs}`),
    placeholderData: keepPreviousData,
  });
  const set =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setF((x) => ({ ...x, [k]: e.target.value }));
      setPage(1);
    };
  return (
    <div className="p-6">
      <SectionTitle>Historial de DTE</SectionTitle>
      <div className="mb-4 grid grid-cols-[1fr_160px_180px_160px_160px] gap-3">
        <Input
          aria-label="Buscar"
          placeholder="Número de control, código de generación o receptor"
          value={f.q}
          onChange={set('q')}
        />
        <Select aria-label="Tipo" value={f.tipo} onChange={set('tipo')}>
          <option value="">Todos los tipos</option>
          <option value="01">FCFE · 01</option>
          <option value="03">CCFE · 03</option>
          <option value="05">NCE · 05</option>
        </Select>
        <Select aria-label="Estado" value={f.estado} onChange={set('estado')}>
          <option value="">Todos los estados</option>
          {['PROCESADO', 'ENCOLADO', 'TRANSMITIDO', 'FIRMADO', 'RECHAZADO', 'INVALIDADO'].map(
            (e) => (
              <option key={e}>{e}</option>
            ),
          )}
        </Select>
        <Input aria-label="Desde" type="date" value={f.desde} onChange={set('desde')} />
        <Input aria-label="Hasta" type="date" value={f.hasta} onChange={set('hasta')} />
      </div>
      <Table head={['Tipo', 'Número de control', 'Receptor', 'Emisión', 'Total', 'Estado']}>
        {data?.items.map((d) => (
          <Tr
            key={d.id}
            onClick={() => nav(`/dte/${d.id}`)}
            data-testid={`fila-${d.numero_control}`}
          >
            <Td>{TIPO_DTE[d.tipo]}</Td>
            <Td className="num whitespace-nowrap">{d.numero_control}</Td>
            <Td>{d.receptor.razon_social}</Td>
            <Td className="whitespace-nowrap">{dateTime(d.emitido_at)}</Td>
            <Td num>{d.tipo === '05' ? `−${money(d.total)}` : money(d.total)}</Td>
            <Td>
              <EstadoDte estado={d.estado} />
            </Td>
          </Tr>
        ))}
        {data?.items.length === 0 && (
          <Tr>
            <Td colSpan={6} className="py-6 text-center text-tinta-600">
              Sin documentos para los filtros.
            </Td>
          </Tr>
        )}
      </Table>
      {data && (
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      )}
    </div>
  );
}
