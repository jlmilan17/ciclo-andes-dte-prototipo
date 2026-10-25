import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { Card, SectionTitle } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { dateTime, money } from '@/lib/format';
import { TIPO_DTE } from '@/pages/clientes/ClienteFicha';
import { useRealtime } from '@/realtime/RealtimeContext';

type Resumen = {
  ventasHoy: { documentos: number; total: number };
  dteHoy: Array<{ tipo: string; estado: Estado; n: number }>;
  pendientes: number;
  bajoStock: {
    total: number;
    sinStock: number;
    items: Array<{ id: string; sku: string; nombre: string; stock: number; stock_minimo: number }>;
  };
  cajas: Array<{ codigo: string; apertura_at: string | null; cajero: string | null }>;
  ultimos: Array<{
    id: string;
    tipo: string;
    numero_control: string;
    estado: Estado;
    emitido_at: string;
    receptor: { razon_social: string };
    total: number;
  }>;
};

/** PRT-ADM-01 (propuesta, ZG-04): cada tarjeta navega a su pantalla. */
export function Resumen() {
  const nav = useNavigate();
  const { pendientes } = useRealtime();
  const { data: r } = useQuery({
    queryKey: ['resumen'],
    queryFn: () => api<Resumen>('/resumen'),
    refetchInterval: 15_000,
  });
  if (!r) return <div className="p-6 text-tinta-600">Cargando…</div>;
  const porTipo = (t: string) =>
    r.dteHoy.filter((x) => x.tipo === t && x.estado !== 'INVALIDADO').reduce((a, x) => a + x.n, 0);
  return (
    <div className="p-6">
      <SectionTitle>Resumen del día</SectionTitle>
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Tarjeta titulo="Ventas de hoy" onClick={() => nav('/dte')} testId="card-ventas">
          <p className="num text-2xl">{money(r.ventasHoy.total)}</p>
          <p className="text-xs text-tinta-600">{r.ventasHoy.documentos} documentos de venta</p>
        </Tarjeta>
        <Tarjeta titulo="DTE por tipo (hoy)" onClick={() => nav('/dte')}>
          <p className="num text-sm">
            FCFE {porTipo('01')} · CCFE {porTipo('03')} · NCE {porTipo('05')}
          </p>
          <p className="text-xs text-tinta-600">
            Invalidados hoy:{' '}
            {r.dteHoy.filter((x) => x.estado === 'INVALIDADO').reduce((a, x) => a + x.n, 0)}
          </p>
        </Tarjeta>
        <Tarjeta
          titulo="Pendientes en contingencia"
          onClick={() => nav('/contingencia')}
          testId="card-contingencia"
        >
          <p className="num text-2xl">{pendientes}</p>
          <p className="text-xs text-tinta-600">
            {pendientes ? 'Se transmitirán al volver la conexión' : 'Cola vacía'}
          </p>
        </Tarjeta>
        <Tarjeta
          titulo="Productos bajo stock"
          onClick={() => nav('/catalogo?estado=BAJO_STOCK')}
          testId="card-stock"
        >
          <p className="num text-2xl">{r.bajoStock.total}</p>
          <p className="text-xs text-tinta-600">{r.bajoStock.sinStock} sin stock</p>
        </Tarjeta>
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <Card className="p-5">
          <h2 className="mb-3 font-cond text-lg font-semibold">Últimos documentos</h2>
          <ul className="divide-y divide-borde text-sm">
            {r.ultimos.map((d) => (
              <li
                key={d.id}
                className="flex cursor-pointer items-center gap-3 py-2 hover:bg-papel-50"
                onClick={() => nav(`/dte/${d.id}`)}
              >
                <span className="w-12 text-xs text-tinta-600">{TIPO_DTE[d.tipo]}</span>
                <span className="num whitespace-nowrap">{d.numero_control}</span>
                <span className="flex-1 truncate">{d.receptor.razon_social}</span>
                <span className="text-xs text-tinta-600">{dateTime(d.emitido_at)}</span>
                <span className="num w-24 text-right">{money(d.total)}</span>
                <EstadoDte estado={d.estado} />
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="mb-3 font-cond text-lg font-semibold">Cajas</h2>
            {r.cajas.map((c) => (
              <div key={c.codigo} className="flex items-center justify-between py-1 text-sm">
                <span>{c.codigo}</span>
                {c.apertura_at ? (
                  <Chip tone="exito">Abierta · {c.cajero}</Chip>
                ) : (
                  <Chip>Cerrada</Chip>
                )}
              </div>
            ))}
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 font-cond text-lg font-semibold">Alertas de stock</h2>
            {r.bajoStock.items.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-1 text-sm">
                <span className="truncate">{p.nombre}</span>
                <Chip tone={p.stock === 0 ? 'error' : 'aviso'}>
                  {p.stock} / mín {p.stock_minimo}
                </Chip>
              </div>
            ))}
          </Card>
        </div>
      </div>
      <div className="mt-4">
        <SupuestoDemo zg="ZG-04">
          el Resumen es una propuesta de diseño; no existe requerimiento formal de dashboard.
        </SupuestoDemo>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  children,
  onClick,
  testId,
}: {
  titulo: string;
  children: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className="rounded-card border border-borde bg-superficie p-5 text-left hover:border-sello-600"
    >
      <p className="mb-2 text-xs uppercase tracking-wide text-tinta-600">{titulo}</p>
      {children}
    </button>
  );
}
