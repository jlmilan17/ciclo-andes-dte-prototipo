import { useQuery, useQueryClient } from '@tanstack/react-query';
import { computeTotals, tipoForReceptor } from '@domain/tax';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '@/api/client';
import { Button, Kbd } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { Modal } from '@/components/Modal';
import { useToast } from '@/components/Toast';
import { useCaja } from '@/hooks/useCaja';
import { money } from '@/lib/format';
import { usePublicConfig } from '@/pages/auth/Login';
import { BuscarClienteModal } from '@/pages/clientes/BuscarClienteModal';
import { ClienteForm } from '@/pages/clientes/ClienteForm';
import { TIPO_LABEL, docId, type Cliente } from '@/pages/clientes/types';
import { useRealtime } from '@/realtime/RealtimeContext';
import { BuscadorProductos } from './BuscadorProductos';
import { useCarrito } from './carrito';
import { CobroModal, type CobroData } from './CobroModal';
import { Procesando, type Paso } from './Procesando';

type VentaResp = {
  dte: { id: string; estado: string };
  pasos: Paso[];
  pipelineMs: number;
  vuelto: number | null;
};

export function Pos() {
  const caja = useCaja();
  if (caja.isLoading) return <div className="p-6 text-tinta-600">Cargando caja…</div>;
  if (caja.data && !caja.data.turno)
    return <Navigate to={caja.data.ultimoCierre ? '/caja/cerrada' : '/caja/apertura'} replace />;
  if (!caja.data) return null;
  return <PosTerminal cajaId={caja.data.caja.id} />;
}

function PosTerminal({ cajaId }: { cajaId: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cfg = usePublicConfig();
  const { online } = useRealtime();
  const [params, setParams] = useSearchParams();
  const carrito = useCarrito(cajaId);
  const buscarRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<'cliente' | 'nuevo-cliente' | 'cobro' | 'anular' | null>(null);
  const [tipoManual, setTipoManual] = useState<'01' | '03' | null>(null);
  const [proc, setProc] = useState<{ pasos: Paso[] | null; error: string | null } | null>(null);

  const cf = useQuery({
    queryKey: ['consumidor-final'],
    queryFn: () => api<Cliente>('/clientes/consumidor-final'),
    staleTime: Infinity,
  });
  const receptor = carrito.receptor ?? cf.data ?? null;

  // "Nuevo documento" desde la ficha del cliente: /pos?cliente=<id>
  const clienteParam = params.get('cliente');
  useEffect(() => {
    if (!clienteParam) return;
    api<Cliente>(`/clientes/${clienteParam}`).then((c) => {
      carrito.setReceptor(c);
      setParams({}, { replace: true });
    });
  }, [clienteParam]);

  const contribuyente = !!receptor && receptor.tipo_contribuyente !== 'CONSUMIDOR_FINAL';
  const sugerido = (receptor ? tipoForReceptor(receptor.tipo_contribuyente) : '01') as '01' | '03';
  const tipo = contribuyente ? (tipoManual ?? sugerido) : '01';
  useEffect(() => setTipoManual(null), [receptor?.id]);

  const totals = useMemo(
    () =>
      computeTotals({
        tipo,
        lineas: carrito.lineas.map((l) => ({ cantidad: l.cantidad, precioUnitario: l.precio })),
        receptor: receptor?.tipo_contribuyente ?? 'CONSUMIDOR_FINAL',
        retentionAppliesTo: (cfg.data?.retentionAppliesTo as 'receptor' | 'emisor') ?? 'receptor',
        emisorGranContribuyente: false,
      }),
    [carrito.lineas, receptor, tipo, cfg.data],
  );
  const vacio = carrito.lineas.length === 0;

  // Atajos del POS: F2 buscar, F4 cliente, F9 cobrar.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (modal || proc) return;
      if (e.key === 'F2') {
        e.preventDefault();
        buscarRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        setModal('cliente');
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (!vacio) setModal('cobro');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [modal, proc, vacio]);

  const emitir = async (d: CobroData) => {
    setModal(null);
    setProc({ pasos: null, error: null });
    try {
      const r = await api<VentaResp>('/ventas', {
        body: {
          cliente_id: receptor?.es_consumidor_final_generico ? null : (receptor?.id ?? null),
          tipo: d.tipo,
          lineas: carrito.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad })),
          metodo_pago: d.metodo,
          efectivo_recibido: d.efectivoRecibido,
        },
      });
      setProc({ pasos: r.pasos, error: null });
      await new Promise((res) => setTimeout(res, 900));
      carrito.limpiar();
      qc.invalidateQueries({ queryKey: ['pos-buscar'] });
      setProc(null);
      nav(`/pos/venta/${r.dte.id}`, {
        state: { pasos: r.pasos, pipelineMs: r.pipelineMs, vuelto: r.vuelto },
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo emitir el documento.';
      setProc({ pasos: [], error: msg });
      if (e instanceof ApiError && e.code === 'STOCK_INSUFICIENTE') {
        qc.invalidateQueries({ queryKey: ['pos-buscar'] });
      }
      setTimeout(() => setProc(null), 2500);
      toast(msg, 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Panel izquierdo fluido: buscador + carrito */}
      <section className="flex min-w-0 flex-1 flex-col gap-4 p-6">
        <BuscadorProductos
          ref={buscarRef}
          onAdd={(p) =>
            carrito.agregar({
              productoId: p.id,
              sku: p.sku,
              nombre: p.nombre,
              tipo: p.tipo,
              precio: p.precio,
              stock: p.stock,
            })
          }
        />
        {carrito.alerta && (
          <div
            role="alert"
            data-testid="alerta-stock"
            className="flex items-center justify-between rounded-card border border-granate-600/40 bg-granate-100 px-4 py-3 text-sm text-granate-600"
          >
            <span>
              Stock insuficiente: solo hay{' '}
              <strong className="num">{carrito.alerta.disponible}</strong> unidades de{' '}
              {carrito.alerta.nombre}. No se agregó la unidad.
            </span>
            <button className="text-xs underline" onClick={() => carrito.setAlerta(null)}>
              Cerrar
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto rounded-card border border-borde bg-superficie">
          {vacio ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-tinta-600">
              <p className="font-cond text-lg">Carrito vacío</p>
              <p className="text-sm">
                Escanee un código o busque un producto (<Kbd>F2</Kbd>).
              </p>
            </div>
          ) : (
            <table className="w-full text-sm" data-testid="carrito">
              <thead className="bg-papel-50 text-left text-xs uppercase tracking-wide text-tinta-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Producto</th>
                  <th className="px-4 py-2 text-right font-medium">Precio</th>
                  <th className="px-4 py-2 text-center font-medium">Cantidad</th>
                  <th className="px-4 py-2 text-right font-medium">Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {carrito.lineas.map((l) => (
                  <tr
                    key={l.productoId}
                    className="border-t border-borde"
                    data-testid={`linea-${l.sku}`}
                  >
                    <td className="px-4 py-2">
                      <span className="block">{l.nombre}</span>
                      <span className="num text-xs text-tinta-600">
                        {l.sku}
                        {l.tipo === 'bien' ? ` · stock ${l.stock}` : ' · servicio'}
                      </span>
                    </td>
                    <td className="num px-4 py-2 text-right">{money(l.precio)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          aria-label={`Quitar una unidad de ${l.nombre}`}
                          className="h-11 w-11 rounded-control border border-borde text-lg hover:bg-papel-50"
                          onClick={() => carrito.setCantidad(l.productoId, l.cantidad - 1)}
                        >
                          −
                        </button>
                        <span className="num w-10 text-center" data-testid="cantidad">
                          {l.cantidad}
                        </span>
                        <button
                          aria-label={`Agregar una unidad de ${l.nombre}`}
                          className="h-11 w-11 rounded-control border border-borde text-lg hover:bg-papel-50"
                          onClick={() => carrito.setCantidad(l.productoId, l.cantidad + 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="num px-4 py-2 text-right">{money(l.precio * l.cantidad)}</td>
                    <td className="px-2">
                      <button
                        aria-label={`Eliminar ${l.nombre}`}
                        className="h-11 w-11 rounded-control text-granate-600 hover:bg-granate-100"
                        onClick={() => carrito.quitar(l.productoId)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-between text-xs text-tinta-600">
          <span>
            <Kbd>F2</Kbd> buscar · <Kbd>F4</Kbd> cliente · <Kbd>F9</Kbd> cobrar
          </span>
          <Button variant="ghost" disabled={vacio} onClick={() => setModal('anular')}>
            Anular venta
          </Button>
        </div>
      </section>

      {/* Panel derecho fijo de 400 px: receptor, totales y cobro */}
      <aside className="flex w-[400px] shrink-0 flex-col gap-4 border-l border-borde bg-superficie p-6">
        <div className="rounded-card border border-borde p-4" data-testid="receptor">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-tinta-600">Receptor</span>
            <Button
              variant="secondary"
              className="h-8"
              kbd="F4"
              onClick={() => setModal('cliente')}
            >
              Cambiar
            </Button>
          </div>
          <p className="font-medium">{receptor?.razon_social ?? 'Consumidor final'}</p>
          {receptor && <p className="num text-xs text-tinta-600">{docId(receptor)}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip tone={receptor?.tipo_contribuyente === 'GRANDE' ? 'oscuro' : 'neutro'}>
              {TIPO_LABEL[receptor?.tipo_contribuyente ?? 'CONSUMIDOR_FINAL']}
            </Chip>
            <Chip tone="neutro" testId="tipo-documento">
              {tipo === '03' ? 'CCFE · 03' : 'FCFE · 01'}
            </Chip>
          </div>
        </div>

        <dl className="num flex flex-col gap-2 text-sm" data-testid="totales">
          <div className="flex justify-between">
            <dt className="font-sans text-tinta-600">Gravado</dt>
            <dd data-testid="total-gravado">{money(totals.gravado)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="font-sans text-tinta-600">IVA 13 %</dt>
            <dd data-testid="total-iva">{money(totals.iva)}</dd>
          </div>
          {totals.retencion > 0 && (
            <div className="flex justify-between text-granate-600" data-testid="fila-retencion">
              <dt className="font-sans">Retención 1 %</dt>
              <dd data-testid="total-retencion">−{money(totals.retencion)}</dd>
            </div>
          )}
        </dl>
        <div className="mt-auto border-t border-borde pt-4">
          <p className="text-xs uppercase tracking-wide text-tinta-600">Total</p>
          <p className="num text-right text-total leading-none font-medium" data-testid="total">
            {money(totals.total)}
          </p>
        </div>
        {!online && (
          <p className="rounded-control bg-ambar-100 px-3 py-2 text-xs text-ambar-600">
            MH sin conexión: la venta se cerrará y el DTE quedará en contingencia hasta transmitir
            el lote.
          </p>
        )}
        <Button
          size="lg"
          kbd="F9"
          disabled={vacio}
          onClick={() => setModal('cobro')}
          data-testid="cobrar"
          className="h-16 text-lg"
        >
          Cobrar
        </Button>
      </aside>

      {modal === 'cliente' && (
        <BuscarClienteModal
          onClose={() => setModal(null)}
          onNew={() => setModal('nuevo-cliente')}
          onSelect={(c) => {
            carrito.setReceptor(c);
            setModal(null);
          }}
        />
      )}
      {modal === 'nuevo-cliente' && (
        <ClienteForm
          submitLabel="Guardar y usar en esta venta"
          onClose={() => setModal(null)}
          onSaved={(c) => {
            carrito.setReceptor(c);
            setModal(null);
            toast('Cliente registrado y asignado a la venta.', 'exito');
          }}
        />
      )}
      {modal === 'cobro' && (
        <CobroModal
          total={totals.total}
          tipo={tipo}
          contribuyente={contribuyente}
          onTipo={setTipoManual}
          onClose={() => setModal(null)}
          onConfirm={emitir}
        />
      )}
      {modal === 'anular' && (
        <Modal
          open
          title="Anular venta"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setModal(null)}>
                Volver
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  carrito.limpiar();
                  setModal(null);
                }}
              >
                Sí, anular
              </Button>
            </>
          }
        >
          Se vaciará el carrito ({carrito.lineas.length} líneas). La venta aún no se ha confirmado,
          por lo que no se emite ningún documento.
        </Modal>
      )}
      {proc && <Procesando pasos={proc.pasos} error={proc.error} />}
    </div>
  );
}
