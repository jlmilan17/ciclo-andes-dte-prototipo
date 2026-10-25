import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, fileUrl } from '@/api/client';
import { BandaSello } from '@/components/BandaSello';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EnviarCorreo } from '@/components/EnviarCorreo';
import { EstadoDte, type Estado } from '@/components/EstadoDte';
import { TicketTermico, type TicketDte } from '@/components/TicketTermico';
import { money } from '@/lib/format';

export type DteVista = TicketDte & {
  estado: Estado;
  pipeline_ms: number | null;
  respuesta_mh: {
    codigoMsg?: string;
    descripcionMsg?: string;
    campo?: string | null;
    observaciones?: string[];
  } | null;
  receptor: TicketDte['receptor'] & { correo?: string | null };
};

/** Venta confirmada · Venta en contingencia · DTE rechazado. */
export function VentaResultado() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { vuelto?: number | null } };
  const [ticket, setTicket] = useState(false);
  const [correo, setCorreo] = useState(false);
  const { data: d } = useQuery({
    queryKey: ['dte', id],
    queryFn: () => api<DteVista>(`/dte/${id}`),
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F9' && !ticket && !correo) {
        e.preventDefault();
        nav('/pos');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav, ticket, correo]);

  if (!d) return <div className="p-6 text-tinta-600">Cargando…</div>;
  const encolado = d.estado === 'ENCOLADO';
  const rechazado = d.estado === 'RECHAZADO';
  const titulo = rechazado
    ? 'DTE rechazado'
    : encolado
      ? 'Venta en contingencia'
      : 'Venta confirmada';

  return (
    <div className="grid h-full grid-cols-[1fr_520px] gap-6 overflow-auto p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-cond text-2xl font-semibold" data-testid="resultado-titulo">
            {titulo}
          </h1>
          <EstadoDte estado={d.estado} />
        </div>
        {encolado && (
          <p className="rounded-card border border-ambar-600/40 bg-ambar-100 px-4 py-3 text-sm text-ambar-600">
            La venta quedó cerrada y el documento firmado. El MH no respondió, así que el DTE espera
            en la cola de contingencia y se transmitirá automáticamente al restablecerse la
            conexión. La caja puede seguir operando.
          </p>
        )}
        {rechazado && (
          <Card
            className="border-granate-600/40 bg-granate-100 p-4 text-sm text-granate-600"
            data-testid="rechazo-mh"
          >
            <p className="font-medium">
              {d.respuesta_mh?.codigoMsg} · {d.respuesta_mh?.descripcionMsg}
            </p>
            {d.respuesta_mh?.campo && <p className="num">Campo: {d.respuesta_mh.campo}</p>}
            {d.respuesta_mh?.observaciones?.map((o) => (
              <p key={o}>{o}</p>
            ))}
            <p className="mt-2 text-tinta-600">
              Un documento rechazado no se reanima: la corrección emite un nuevo DTE que lo
              referencia (ZG-16).
            </p>
            <Link to={`/dte/${d.id}`} className="mt-2 inline-block text-sello-600 underline">
              Ver detalle y corregir
            </Link>
          </Card>
        )}
        <BandaSello
          numeroControl={d.numero_control}
          codigoGeneracion={d.codigo_generacion}
          selloRecepcion={d.sello_recepcion}
          contingencia={encolado}
        />
        <Card className="grid grid-cols-2 gap-4 p-5 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-tinta-600">Receptor</p>
            <p>{d.receptor.razon_social}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-tinta-600">Total</p>
            <p className="num text-2xl" data-testid="resultado-total">
              {money(d.total)}
            </p>
            {loc.state?.vuelto != null && loc.state.vuelto > 0 && (
              <p className="num text-tinta-600">Vuelto {money(loc.state.vuelto)}</p>
            )}
          </div>
          {d.pipeline_ms != null && (
            <p className="col-span-2 text-xs text-tinta-600" data-testid="pipeline-ms">
              Firma y envío: <span className="num">{d.pipeline_ms} ms</span>{' '}
              {d.pipeline_ms <= 3000
                ? '(≤ 3 s, RNF-CCFE-01)'
                : '— superó 3 s: entró la política de contingencia'}
            </p>
          )}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button kbd="F9" onClick={() => nav('/pos')}>
            Nueva venta
          </Button>
          <Button variant="secondary" onClick={() => setTicket(true)}>
            {encolado ? 'Imprimir comprobante provisional' : 'Imprimir ticket'}
          </Button>
          <a href={fileUrl(`/dte/${d.id}/pdf?download=1`)}>
            <Button variant="secondary">Descargar PDF</Button>
          </a>
          <a href={fileUrl(`/dte/${d.id}/json?download=1`)}>
            <Button variant="secondary">Descargar JSON</Button>
          </a>
          <Button variant="secondary" onClick={() => setCorreo(true)}>
            Enviar por correo
          </Button>
          <Link to={`/dte/${d.id}`}>
            <Button variant="ghost">Ver detalle del DTE</Button>
          </Link>
        </div>
      </div>
      <iframe
        title="Representación gráfica del DTE"
        src={fileUrl(`/dte/${d.id}/pdf`)}
        className="h-full min-h-[600px] w-full rounded-card border border-borde bg-white"
      />
      {ticket && <TicketTermico d={d} onClose={() => setTicket(false)} />}
      {correo && (
        <EnviarCorreo
          dteId={d.id}
          sugerido={d.receptor.correo ?? null}
          onClose={() => setCorreo(false)}
        />
      )}
    </div>
  );
}
