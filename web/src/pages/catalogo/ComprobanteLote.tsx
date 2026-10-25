import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { dateTime, money } from '@/lib/format';

type Lote = {
  id: string;
  sku: string;
  producto: string;
  proveedor: string;
  usuario: string;
  cantidad: number;
  costo_unitario: number;
  factura_proveedor: string;
  fecha_recepcion: string;
  stock_anterior: number;
  costo_promedio_anterior: number;
  costo_promedio_nuevo: number;
  created_at: string;
};

/** Comprobante de ingreso de lote (sección 7), imprimible. */
export function ComprobanteLote({ loteId, onClose }: { loteId: string; onClose: () => void }) {
  const { data: l } = useQuery({
    queryKey: ['lote', loteId],
    queryFn: () => api<Lote>(`/lotes/${loteId}`),
  });
  return (
    <Modal
      open
      title="Comprobante de ingreso de lote"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir
          </Button>
          <Button onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      {l && (
        <div className="num space-y-1 text-sm" data-testid="comprobante-lote">
          <p className="font-sans text-xs uppercase tracking-wide text-tinta-600">
            Ciclo Andes, S.A. de C.V. · NRC 245891-8
          </p>
          <p className="font-sans font-semibold">Ingreso {l.id.slice(0, 8).toUpperCase()}</p>
          <hr className="my-2 border-dashed border-borde" />
          <Row k="Proveedor" v={l.proveedor} />
          <Row k="Factura proveedor" v={l.factura_proveedor} />
          <Row k="Fecha recepción" v={String(l.fecha_recepcion).slice(0, 10)} />
          <Row k="Producto" v={`${l.sku} · ${l.producto}`} />
          <Row k="Cantidad" v={String(l.cantidad)} />
          <Row k="Costo unitario" v={money(l.costo_unitario)} />
          <Row k="Stock" v={`${l.stock_anterior} → ${l.stock_anterior + l.cantidad}`} />
          <Row
            k="Costo promedio"
            v={`${money(l.costo_promedio_anterior)} → ${money(l.costo_promedio_nuevo)}`}
          />
          <hr className="my-2 border-dashed border-borde" />
          <Row k="Registrado por" v={`${l.usuario} · ${dateTime(l.created_at)}`} />
        </div>
      )}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="font-sans text-tinta-600">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
