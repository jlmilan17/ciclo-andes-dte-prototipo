import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Card';
import { StockChip } from '@/components/Chip';
import { Input, Select } from '@/components/Input';
import { Pagination } from '@/components/Pagination';
import { Table, Td, Tr } from '@/components/Table';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';
import { LotePanel } from './LotePanel';
import { ProductoPanel } from './ProductoPanel';
import type { Producto, ProductosPage } from './types';

export function Catalogo() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [categoria, setCategoria] = useState('');
  const estado = params.get('estado') ?? '';
  const dq = useDebounced(q, 250);
  const [editing, setEditing] = useState<Producto | 'nuevo' | null>(null);
  const [lote, setLote] = useState<Producto | true | null>(null);

  const qs = new URLSearchParams({ page: String(page) });
  if (dq) qs.set('q', dq);
  if (categoria) qs.set('categoria', categoria);
  if (estado) qs.set('estado', estado);
  const { data, isFetching } = useQuery({
    queryKey: ['productos', qs.toString()],
    queryFn: () => api<ProductosPage>(`/productos?${qs}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="p-6">
      <SectionTitle
        actions={
          <>
            <Button variant="secondary" onClick={() => setLote(true)}>
              Registrar ingreso de lote
            </Button>
            <Button onClick={() => setEditing('nuevo')}>Nuevo producto</Button>
          </>
        }
      >
        Catálogo
      </SectionTitle>

      <div className="mb-4 grid grid-cols-[1fr_200px_200px] gap-3">
        <Input
          placeholder="Buscar por SKU o nombre"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Buscar producto"
        />
        <Select
          aria-label="Categoría"
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas las categorías</option>
          {data?.categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select
          aria-label="Estado"
          value={estado}
          onChange={(e) => {
            setParams(e.target.value ? { estado: e.target.value } : {});
            setPage(1);
          }}
        >
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activo</option>
          <option value="BAJO_STOCK">Bajo stock</option>
          <option value="SIN_STOCK">Sin stock</option>
          <option value="INACTIVO">Inactivo</option>
        </Select>
      </div>

      <div className={isFetching ? 'opacity-70' : undefined}>
        <Table
          head={['SKU', 'Producto', 'Categoría', 'Costo prom.', 'Precio (neto)', 'Stock', 'Estado']}
        >
          {data?.items.map((p) => (
            <Tr key={p.id} onClick={() => setEditing(p)} data-testid={`producto-${p.sku}`}>
              <Td className="num whitespace-nowrap">{p.sku}</Td>
              <Td>{p.nombre}</Td>
              <Td className="text-tinta-600">{p.categoria}</Td>
              <Td num>{p.tipo === 'servicio' ? '—' : money(p.costo_promedio)}</Td>
              <Td num>{money(p.precio)}</Td>
              <Td num>{p.tipo === 'servicio' ? 'servicio' : p.stock}</Td>
              <Td>
                <StockChip estado={p.estado} />
              </Td>
            </Tr>
          ))}
          {data && data.items.length === 0 && (
            <Tr>
              <Td colSpan={7} className="py-8 text-center text-tinta-600">
                Sin resultados.
              </Td>
            </Tr>
          )}
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

      {editing && (
        <ProductoPanel
          producto={editing === 'nuevo' ? null : editing}
          categorias={data?.categorias ?? []}
          onClose={() => setEditing(null)}
          onIngreso={(p) => {
            setEditing(null);
            setLote(p);
          }}
        />
      )}
      {lote && <LotePanel producto={lote === true ? null : lote} onClose={() => setLote(null)} />}
    </div>
  );
}
