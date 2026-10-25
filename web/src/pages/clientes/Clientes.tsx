import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Input } from '@/components/Input';
import { Pagination } from '@/components/Pagination';
import { Table, Td, Tr } from '@/components/Table';
import { useDebounced } from '@/hooks/useDebounced';
import { ClienteForm } from './ClienteForm';
import { TIPO_LABEL, type Cliente } from './types';

export function Clientes() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [nuevo, setNuevo] = useState(false);
  const dq = useDebounced(q, 200);
  const { data } = useQuery({
    queryKey: ['clientes', dq, page],
    queryFn: () =>
      api<{ items: Cliente[]; total: number; page: number; pageSize: number }>(
        `/clientes?page=${page}&q=${encodeURIComponent(dq)}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="p-6">
      <SectionTitle actions={<Button onClick={() => setNuevo(true)}>Nuevo cliente</Button>}>
        Clientes
      </SectionTitle>
      <Input
        className="mb-4"
        placeholder="Buscar por nombre, NIT, NRC o DUI"
        aria-label="Buscar cliente"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <div className="mt-4">
        <Table head={['Nombre / razón social', 'NIT', 'NRC', 'DUI', 'Tipo', 'Estado']}>
          {data?.items.map((c) => (
            <Tr key={c.id} onClick={() => nav(`/clientes/${c.id}`)}>
              <Td>{c.razon_social}</Td>
              <Td className="num whitespace-nowrap">{c.nit ?? '—'}</Td>
              <Td className="num whitespace-nowrap">{c.nrc ?? '—'}</Td>
              <Td className="num whitespace-nowrap">{c.dui ?? '—'}</Td>
              <Td>
                <Chip tone={c.tipo_contribuyente === 'GRANDE' ? 'oscuro' : 'neutro'}>
                  {TIPO_LABEL[c.tipo_contribuyente]}
                </Chip>
              </Td>
              <Td>{c.activo ? <Chip tone="exito">Activo</Chip> : <Chip>Inactivo</Chip>}</Td>
            </Tr>
          ))}
        </Table>
        {data && (
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={setPage}
          />
        )}
      </div>
      {nuevo && (
        <ClienteForm onClose={() => setNuevo(false)} onSaved={(c) => nav(`/clientes/${c.id}`)} />
      )}
    </div>
  );
}
