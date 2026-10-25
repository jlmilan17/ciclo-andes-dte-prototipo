import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { BandaSello } from '@/components/BandaSello';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { cx } from '@/components/cx';
import { EnviarCorreo } from '@/components/EnviarCorreo';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { JsonViewer } from '@/components/JsonViewer';
import { SupuestoDemo } from '@/components/SupuestoDemo';
import { Table, Td, Tr } from '@/components/Table';
import { TicketTermico } from '@/components/TicketTermico';
import { useToast } from '@/components/Toast';
import { dateTime, money } from '@/lib/format';
import { BuscarClienteModal } from '@/pages/clientes/BuscarClienteModal';
import type { Cliente } from '@/pages/clientes/types';
import type { DteVista } from '@/pages/pos/VentaResultado';
import { InvalidarModal } from './InvalidarModal';

type Evento = {
  id: number;
  estado_origen: Estado | null;
  estado_destino: Estado;
  actor: string;
  motivo: string | null;
  payload: unknown;
  created_at: string;
};
type Detalle = Omit<DteVista, 'lineas'> & {
  cliente_id: string;
  fh_procesamiento: string | null;
  procesado_at: string | null;
  intentos_transmision: number;
  lote_id: string | null;
  referenced_dte_id: string | null;
  ref_numero_control: string | null;
  ref_codigo_generacion: string | null;
  corrige_dte_id: string | null;
  corrige_numero_control: string | null;
  lineas: Array<
    DteVista['lineas'][number] & { num_item: number; codigo: string; tipo_item: string }
  >;
  eventos: Evento[];
  invalidable: { permitido: boolean; motivo: string | null; vence: string | null };
  invalidacion: {
    codigo_generacion: string;
    json: unknown;
    jws: string;
    sello: string;
    motivo: string;
    responsable: string;
    observaciones: string | null;
    respuesta_mh: unknown;
    created_at: string;
  } | null;
  notasCredito: Array<{ id: string; numero_control: string; estado: Estado; total: number }>;
  correccion: { id: string; numero_control: string; estado: Estado } | null;
};

const NOMBRE: Record<string, string> = {
  '01': 'Factura de consumidor final electrónica',
  '03': 'Comprobante de crédito fiscal electrónico',
  '05': 'Nota de crédito electrónica',
};
const TABS = ['Resumen', 'Líneas', 'JSON', 'Firma', 'Eventos', 'Bitácora'] as const;
const PASO: Partial<Record<Estado, string>> = {
  BORRADOR: 'Generado',
  FIRMADO: 'Firmado',
  ENCOLADO: 'En contingencia',
  TRANSMITIDO: 'Transmitido',
  PROCESADO: 'Sellado',
  RECHAZADO: 'Rechazado',
  INVALIDADO: 'Invalidado',
};

/** Detalle de DTE: pestañas Resumen, Líneas, JSON, Firma, Eventos y Bitácora. */
export function DteDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user?.rol === 'ADMIN';
  const nav = useNavigate();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Resumen');
  const [modal, setModal] = useState<'invalidar' | 'ticket' | 'correo' | 'corregir' | null>(null);
  const { data: d } = useQuery({
    queryKey: ['dte', id],
    queryFn: () => api<Detalle>(`/dte/${id}`),
  });
  if (!d) return <div className="p-6 text-tinta-600">Cargando…</div>;

  const puedeNce = admin && d.tipo !== '05' && d.estado === 'PROCESADO';
  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-tinta-600">{NOMBRE[d.tipo]}</p>
          <div className="flex items-center gap-3">
            <h1 className="num text-xl">{d.numero_control}</h1>
            <span data-testid="estado-detalle">
              <EstadoDte estado={d.estado} />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={fileUrl(`/dte/${d.id}/pdf?download=1`)}>
            <Button variant="secondary">Descargar PDF</Button>
          </a>
          <a href={fileUrl(`/dte/${d.id}/json?download=1`)}>
            <Button variant="secondary">Descargar JSON</Button>
          </a>
          <Button variant="secondary" onClick={() => setModal('ticket')}>
            {d.sello_recepcion ? 'Ticket' : 'Comprobante provisional'}
          </Button>
          <Button variant="secondary" onClick={() => setModal('correo')}>
            Enviar por correo
          </Button>
          {admin && (
            <>
              <Button
                variant="secondary"
                disabled={!puedeNce}
                onClick={() => nav(`/dte/${d.id}/nce`)}
                title={puedeNce ? undefined : 'Solo sobre CCFE/FCFE PROCESADOS'}
              >
                Emitir NCE
              </Button>
              <Button
                variant="danger"
                disabled={!d.invalidable.permitido}
                onClick={() => setModal('invalidar')}
                data-testid="btn-invalidar"
              >
                Invalidar
              </Button>
            </>
          )}
        </div>
      </div>

      {admin && !d.invalidable.permitido && d.estado !== 'INVALIDADO' && (
        <p
          className="mb-4 rounded-control border border-borde bg-papel-50 px-3 py-2 text-xs text-tinta-600"
          data-testid="motivo-no-invalidable"
        >
          Invalidar no disponible: {d.invalidable.motivo}
        </p>
      )}

      {d.estado === 'RECHAZADO' && (
        <Card className="mb-4 border-granate-600/40 bg-granate-100 p-4 text-sm text-granate-600">
          <p className="font-medium">
            Rechazado por el MH: {(d.respuesta_mh as { codigoMsg?: string })?.codigoMsg} ·{' '}
            {(d.respuesta_mh as { descripcionMsg?: string })?.descripcionMsg}
          </p>
          {d.correccion ? (
            <p className="mt-1 text-tinta-600">
              Corregido con{' '}
              <Link className="num text-sello-600 underline" to={`/dte/${d.correccion.id}`}>
                {d.correccion.numero_control}
              </Link>
            </p>
          ) : (
            d.tipo !== '05' && (
              <div className="mt-2 flex items-center gap-3">
                <Button onClick={() => setModal('corregir')} data-testid="corregir">
                  Corregir y reenviar
                </Button>
                <span className="text-xs text-tinta-600">
                  Se emite un nuevo DTE (nuevo código de generación) que referencia a este (ZG-16).
                </span>
              </div>
            )
          )}
        </Card>
      )}

      <nav className="mb-4 flex gap-1 border-b border-borde" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 text-sm',
              tab === t
                ? 'border-sello-600 font-medium text-sello-600'
                : 'border-transparent text-tinta-600 hover:text-tinta-900',
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'Resumen' && <Resumen d={d} />}
      {tab === 'Líneas' && <Lineas d={d} />}
      {tab === 'JSON' && <JsonTab id={d.id} />}
      {tab === 'Firma' && <FirmaTab id={d.id} />}
      {tab === 'Eventos' && <EventosTab d={d} />}
      {tab === 'Bitácora' && <Bitacora eventos={d.eventos} />}

      {modal === 'invalidar' && (
        <InvalidarModal
          dteId={d.id}
          numeroControl={d.numero_control}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'ticket' && <TicketTermico d={d} onClose={() => setModal(null)} />}
      {modal === 'correo' && (
        <EnviarCorreo
          dteId={d.id}
          sugerido={d.receptor.correo ?? null}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'corregir' && <Corregir d={d} onClose={() => setModal(null)} />}
    </div>
  );
}

function Corregir({ d, onClose }: { d: Detalle; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [cambiar, setCambiar] = useState(false);
  const corr = useMutation({
    mutationFn: (cliente: Cliente | null) =>
      api<{ dte: { id: string } }>(`/dte/${d.id}/corregir`, {
        body: cliente
          ? { cliente_id: cliente.es_consumidor_final_generico ? null : cliente.id }
          : {},
      }),
    onSuccess: (r) => nav(`/pos/venta/${r.dte.id}`),
    onError: (e) => toast(e.message, 'error'),
  });
  if (cambiar)
    return (
      <BuscarClienteModal onClose={onClose} onNew={onClose} onSelect={(c) => corr.mutate(c)} />
    );
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta-900/40"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <Card className="w-full max-w-md p-6">
        <h2 className="font-cond text-lg font-semibold">Corregir y reenviar</h2>
        <p className="mt-2 text-sm text-tinta-600">
          Receptor actual: <strong>{d.receptor.razon_social}</strong>. Puede reenviar con el mismo
          receptor o elegir otro (p. ej. si el NRC era incorrecto).
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCambiar(true)}>
            Cambiar receptor
          </Button>
          <Button onClick={() => corr.mutate(null)} disabled={corr.isPending}>
            Reenviar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Campo({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-tinta-600">{k}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Resumen({ d }: { d: Detalle }) {
  const r = d.receptor as Record<string, string | null>;
  return (
    <div className="grid grid-cols-[1fr_520px] gap-6">
      <div className="flex flex-col gap-4">
        <BandaSello
          numeroControl={d.numero_control}
          codigoGeneracion={d.codigo_generacion}
          selloRecepcion={d.sello_recepcion}
          contingencia={d.estado === 'ENCOLADO'}
        />
        <Card className="p-5">
          <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 text-sm">
            <Campo k="Receptor">
              {d.cliente_id ? (
                <Link className="text-sello-600 underline" to={`/clientes/${d.cliente_id}`}>
                  {r.razon_social}
                </Link>
              ) : (
                r.razon_social
              )}
            </Campo>
            <Campo k="Identificación">
              <span className="num">
                {[r.nit && `NIT ${r.nit}`, r.nrc && `NRC ${r.nrc}`, r.dui && `DUI ${r.dui}`]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </span>
            </Campo>
            <Campo k="Emisión">{dateTime(d.emitido_at)}</Campo>
            <Campo k="Procesado por el MH">
              {d.fh_procesamiento ? dateTime(d.fh_procesamiento) : '—'}
            </Campo>
            <Campo k="Firma y envío">
              {d.pipeline_ms != null ? <span className="num">{d.pipeline_ms} ms</span> : '—'}
            </Campo>
            <Campo k="Intentos de transmisión">
              <span className="num">{d.intentos_transmision}</span>
              {d.lote_id && (
                <span className="text-xs text-tinta-600">
                  {' '}
                  · lote {d.lote_id.slice(0, 8).toUpperCase()}
                </span>
              )}
            </Campo>
            <Campo k="Caja · emitido por">
              {d.caja ?? '—'} · {d.emitido_por ?? '—'}
            </Campo>
            {d.metodo_pago && <Campo k="Forma de pago">{d.metodo_pago}</Campo>}
            {d.ref_numero_control && (
              <Campo k="Documento relacionado">
                <Link className="num text-sello-600 underline" to={`/dte/${d.referenced_dte_id}`}>
                  {d.ref_numero_control}
                </Link>
                <span className="num block text-xs text-tinta-600">{d.ref_codigo_generacion}</span>
              </Campo>
            )}
            {d.corrige_numero_control && (
              <Campo k="Corrige a">
                <Link className="num text-sello-600 underline" to={`/dte/${d.corrige_dte_id}`}>
                  {d.corrige_numero_control}
                </Link>
              </Campo>
            )}
          </dl>
        </Card>
        <Card className="num p-5 text-sm">
          <div className="flex justify-between">
            <span className="font-sans text-tinta-600">Gravado</span>
            {money(d.gravado)}
          </div>
          <div className="flex justify-between">
            <span className="font-sans text-tinta-600">IVA 13 %</span>
            {money(d.iva)}
          </div>
          {d.retencion > 0 && (
            <div className="flex justify-between">
              <span className="font-sans text-tinta-600">Retención 1 %</span>−{money(d.retencion)}
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-borde pt-2 text-xl">
            <span className="font-sans">Total</span>
            {money(d.total)}
          </div>
        </Card>
        {d.notasCredito.length > 0 && (
          <Card className="p-5 text-sm">
            <p className="mb-2 font-cond font-semibold">Notas de crédito vinculadas</p>
            {d.notasCredito.map((n) => (
              <Link
                key={n.id}
                to={`/dte/${n.id}`}
                className="flex items-center justify-between py-1 hover:underline"
              >
                <span className="num">{n.numero_control}</span>
                <span className="num">−{money(n.total)}</span>
                <EstadoDte estado={n.estado} />
              </Link>
            ))}
          </Card>
        )}
      </div>
      <iframe
        title="Representación gráfica"
        src={fileUrl(`/dte/${d.id}/pdf`)}
        className="h-[720px] w-full rounded-card border border-borde bg-white"
      />
    </div>
  );
}

function Lineas({ d }: { d: Detalle }) {
  return (
    <Table head={['#', 'Código', 'Descripción', 'Tipo', 'Cantidad', 'Precio unit.', 'Gravado']}>
      {d.lineas.map((l) => (
        <Tr key={l.id}>
          <Td num>{l.num_item}</Td>
          <Td className="num">{l.codigo}</Td>
          <Td>{l.descripcion}</Td>
          <Td>{l.tipo_item}</Td>
          <Td num>{l.cantidad}</Td>
          <Td num>{money(l.precio_unitario)}</Td>
          <Td num>{money(l.gravado)}</Td>
        </Tr>
      ))}
    </Table>
  );
}

function JsonTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['dte', id, 'json'],
    queryFn: () => api<unknown>(`/dte/${id}/json`),
  });
  return (
    <div className="flex flex-col gap-2">
      <SupuestoDemo zg="ZG-11">
        estructura de demostración; no se afirma conformidad con el esquema oficial del MH.
      </SupuestoDemo>
      <JsonViewer value={data ?? {}} testId="json-dte" />
    </div>
  );
}

function FirmaTab({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['dte', id, 'firma'],
    queryFn: () =>
      api<{ jws: string; header: unknown; payload: unknown; signature: string } | null>(
        `/dte/${id}/firma`,
      ),
  });
  if (data === null) return <p className="text-tinta-600">El documento aún no está firmado.</p>;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <section>
        <h3 className="mb-1 font-cond font-semibold">Encabezado</h3>
        <JsonViewer value={data.header} maxHeight="max-h-40" />
        <h3 className="mb-1 mt-4 font-cond font-semibold">Firma (base64url)</h3>
        <pre className="num max-h-40 overflow-auto break-all whitespace-pre-wrap rounded-card border border-borde bg-papel-50 p-3 text-xs">
          {data.signature}
        </pre>
        <h3 className="mb-1 mt-4 font-cond font-semibold">JWS compacto</h3>
        <pre className="num max-h-48 overflow-auto break-all whitespace-pre-wrap rounded-card border border-borde bg-papel-50 p-3 text-[10px]">
          {data.jws}
        </pre>
        <p className="mt-2 text-xs text-pizarra-400">
          Firmado con RS256 y un certificado de PRUEBAS autogenerado.
        </p>
      </section>
      <section>
        <h3 className="mb-1 font-cond font-semibold">Carga útil</h3>
        <JsonViewer value={data.payload} maxHeight="max-h-[70vh]" />
      </section>
    </div>
  );
}

function EventosTab({ d }: { d: Detalle }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1 font-cond font-semibold">Respuesta del MH</h3>
        {d.respuesta_mh ? (
          <JsonViewer value={d.respuesta_mh} maxHeight="max-h-64" />
        ) : (
          <p className="text-sm text-tinta-600">Sin respuesta del MH todavía.</p>
        )}
      </section>
      <section>
        <h3 className="mb-1 font-cond font-semibold">Evento de invalidación</h3>
        {d.invalidacion ? (
          <div className="flex flex-col gap-3" data-testid="evento-invalidacion">
            <Card className="num grid grid-cols-[200px_1fr] gap-y-1 p-4 text-sm">
              <span className="font-sans text-tinta-600">Motivo</span>
              <span className="font-sans">{d.invalidacion.motivo}</span>
              <span className="font-sans text-tinta-600">Responsable</span>
              <span className="font-sans">
                {d.invalidacion.responsable} · {dateTime(d.invalidacion.created_at)}
              </span>
              {d.invalidacion.observaciones && (
                <>
                  <span className="font-sans text-tinta-600">Observaciones</span>
                  <span className="font-sans">{d.invalidacion.observaciones}</span>
                </>
              )}
              <span className="font-sans text-tinta-600">Código de generación</span>
              <span>{d.invalidacion.codigo_generacion}</span>
              <span className="font-sans text-tinta-600">Sello del evento</span>
              <span className="text-sello-600">{d.invalidacion.sello}</span>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <JsonViewer value={d.invalidacion.json} maxHeight="max-h-72" />
              <JsonViewer value={d.invalidacion.respuesta_mh} maxHeight="max-h-72" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-tinta-600">Este documento no tiene eventos de invalidación.</p>
        )}
      </section>
    </div>
  );
}

/** Bitácora inmutable (dte_event): una línea de tiempo con cada transición. */
function Bitacora({ eventos }: { eventos: Evento[] }) {
  return (
    <ol className="relative ml-3 border-l-2 border-borde" data-testid="bitacora">
      {eventos.map((e) => (
        <li key={e.id} className="mb-5 ml-6">
          <span
            className={cx(
              'absolute -left-[9px] mt-1 h-4 w-4 rounded-full border-2 bg-superficie',
              e.estado_destino === 'PROCESADO'
                ? 'border-sello-600'
                : e.estado_destino === 'ENCOLADO'
                  ? 'border-ambar-600'
                  : ['RECHAZADO', 'INVALIDADO'].includes(e.estado_destino)
                    ? 'border-granate-600'
                    : 'border-tinta-600',
            )}
          />
          <div className="flex items-center gap-3">
            <span className="font-medium">{PASO[e.estado_destino]}</span>
            <EstadoDte estado={e.estado_destino} />
            <span className="num text-xs text-tinta-600">{dateTime(e.created_at)}</span>
          </div>
          <p className="text-sm text-tinta-600">
            {e.actor}
            {e.motivo ? ` · ${e.motivo}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
