import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { weightedAverageCost } from '@domain/avgCost';
import { useState } from 'react';
import { ApiError, api } from '@/api/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useDebounced } from '@/hooks/useDebounced';
import { money } from '@/lib/format';
import { parseMoney } from '@/lib/moneyInput';
import { ComprobanteLote } from './ComprobanteLote';
import type { Producto, ProductosPage } from './types';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/El_Salvador' });

/** RF-CAT-02/03: ingreso con proveedor y costo promedio previsualizado antes de confirmar. */
export function LotePanel({
  producto: inicial,
  onClose,
}: {
  producto: Producto | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [producto, setProducto] = useState<Producto | null>(inicial);
  const [busca, setBusca] = useState('');
  const dq = useDebounced(busca, 250);
  const [proveedorId, setProveedorId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [factura, setFactura] = useState('');
  const [fecha, setFecha] = useState(today());
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  const proveedores = useQuery({
    queryKey: ['proveedores'],
    queryFn: () => api<{ items: Array<{ id: string; nombre: string }> }>('/proveedores'),
  });
  const resultados = useQuery({
    queryKey: ['productos', 'lote', dq],
    queryFn: () => api<ProductosPage>(`/productos?q=${encodeURIComponent(dq)}`),
    enabled: !producto && dq.length > 1,
  });

  const cant = Number(cantidad);
  const costoC = parseMoney(costo);
  const valido = !!producto && Number.isInteger(cant) && cant > 0 && costoC !== null;
  const nuevoCosto = valido
    ? weightedAverageCost(producto!.stock, producto!.costo_promedio, cant, costoC!)
    : null;

  const save = useMutation({
    mutationFn: () =>
      api<{ id: string; costo_promedio: number; stock: number }>('/lotes', {
        body: {
          producto_id: producto!.id,
          proveedor_id: proveedorId,
          cantidad: cant,
          costo_unitario: costoC,
          factura_proveedor: factura,
          fecha_recepcion: fecha,
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      toast(`Ingreso registrado: ${r.stock} u a ${money(r.costo_promedio)}.`, 'exito');
      setHecho(r.id);
    },
    onError: (e) =>
      setError({ field: e instanceof ApiError ? e.field : undefined, message: e.message }),
  });

  if (hecho) return <ComprobanteLote loteId={hecho} onClose={onClose} />;

  return (
    <Modal
      side
      open
      title="Registrar ingreso de lote"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!valido || !proveedorId || !factura || save.isPending}
            onClick={() => save.mutate()}
          >
            Confirmar ingreso
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {producto ? (
          <Card className="flex items-center justify-between p-3">
            <div>
              <p className="num text-xs text-tinta-600">{producto.sku}</p>
              <p className="text-sm">{producto.nombre}</p>
            </div>
            {!inicial && (
              <Button variant="ghost" onClick={() => setProducto(null)}>
                Cambiar
              </Button>
            )}
          </Card>
        ) : (
          <div>
            <Input
              label="Producto"
              placeholder="Buscar por SKU o nombre"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
            <ul className="mt-1 max-h-60 overflow-auto rounded-card border border-borde empty:hidden">
              {resultados.data?.items
                .filter((p) => p.tipo === 'bien')
                .map((p) => (
                  <li key={p.id}>
                    <button
                      className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-papel-50"
                      onClick={() => setProducto(p)}
                    >
                      <span>{p.nombre}</span>
                      <span className="num text-tinta-600">{p.sku}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
        <Select
          label="Proveedor"
          value={proveedorId}
          onChange={(e) => setProveedorId(e.target.value)}
          error={error?.field === 'proveedor_id' ? error.message : undefined}
        >
          <option value="">Seleccione…</option>
          {proveedores.data?.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Cantidad"
            mono
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <Input
            label="Costo unitario"
            mono
            inputMode="decimal"
            placeholder="0.00"
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Factura del proveedor"
            mono
            value={factura}
            onChange={(e) => setFactura(e.target.value)}
          />
          <Input
            label="Fecha de recepción"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {producto && (
          <Card className="p-4" data-testid="preview-costo">
            <p className="mb-2 text-xs uppercase tracking-wide text-tinta-600">Previsualización</p>
            <div className="num grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-sm">
              <span className="font-sans text-tinta-600">Stock</span>
              <span className="text-right">{producto.stock}</span>
              <span>→</span>
              <span className="text-right font-medium">{valido ? producto.stock + cant : '—'}</span>
              <span className="font-sans text-tinta-600">Costo promedio</span>
              <span className="text-right">{money(producto.costo_promedio)}</span>
              <span>→</span>
              <span className="text-right font-medium text-sello-600">
                {nuevoCosto !== null ? money(nuevoCosto) : '—'}
              </span>
            </div>
            <p className="mt-2 text-xs text-pizarra-400">
              (stock × costo actual + cantidad × costo del lote) / (stock + cantidad)
            </p>
          </Card>
        )}
        {error && !error.field && <p className="text-sm text-granate-600">{error.message}</p>}
      </div>
    </Modal>
  );
}
