import { fileUrl } from '@/api/client';
import { dateTime, money } from '@/lib/format';
import { Button } from './Button';
import { Modal } from './Modal';

export type TicketDte = {
  id: string;
  tipo: string;
  numero_control: string;
  codigo_generacion: string;
  sello_recepcion: string | null;
  emitido_at: string;
  receptor: { razon_social?: string; nrc?: string | null; nit?: string | null };
  lineas: Array<{
    id: string;
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    gravado: number;
  }>;
  gravado: number;
  iva: number;
  retencion: number;
  total: number;
  metodo_pago: string | null;
  efectivo_recibido: number | null;
  vuelto: number | null;
  caja: string | null;
  emitido_por: string | null;
};

const NOMBRE: Record<string, string> = {
  '01': 'FACTURA CONSUMIDOR FINAL',
  '03': 'CREDITO FISCAL',
  '05': 'NOTA DE CREDITO',
};

/** Vista previa térmica de 80 mm: ticket de venta o comprobante provisional de contingencia. */
export function TicketTermico({ d, onClose }: { d: TicketDte; onClose: () => void }) {
  const provisional = !d.sello_recepcion;
  const Row = ({ l, r, b }: { l: string; r: string; b?: boolean }) => (
    <div className={`flex justify-between ${b ? 'font-medium' : ''}`}>
      <span>{l}</span>
      <span>{r}</span>
    </div>
  );
  return (
    <Modal
      open
      width="max-w-md"
      title={provisional ? 'Comprobante provisional de contingencia' : 'Ticket de venta'}
      onClose={onClose}
      footer={
        <>
          <a href={fileUrl(`/dte/${d.id}/ticket.pdf`)} target="_blank" rel="noreferrer">
            <Button variant="secondary">Exportar PDF</Button>
          </a>
          <Button onClick={() => window.print()}>Imprimir</Button>
        </>
      }
    >
      <div className="flex justify-center bg-papel-50 py-4">
        <div
          data-testid="ticket"
          className="num w-[302px] bg-white px-4 py-5 text-[11px] leading-snug text-tinta-900 shadow"
        >
          <p className="text-center font-medium">CICLO ANDES, S.A. DE C.V.</p>
          <p className="text-center">NIT 0614-120598-102-3 · NRC 245891-8</p>
          <p className="text-center">Calle La Mascota 245, San Salvador</p>
          <p className="my-1 border-t border-dashed border-tinta-600" />
          <p className="text-center font-medium">{NOMBRE[d.tipo]}</p>
          {provisional && (
            <p className="my-1 border border-dashed border-ambar-600 px-1 text-center font-medium text-ambar-600">
              Documento en contingencia — pendiente de sello
            </p>
          )}
          <p className="text-center">{dateTime(d.emitido_at)}</p>
          <p className="text-center">
            {d.caja} · {d.emitido_por}
          </p>
          <p className="text-center">Cliente: {d.receptor.razon_social}</p>
          <p className="my-1 border-t border-dashed border-tinta-600" />
          {d.lineas.map((l) => (
            <div key={l.id}>
              <p>{l.descripcion}</p>
              <Row l={`  ${l.cantidad} x ${money(l.precio_unitario)}`} r={money(l.gravado)} />
            </div>
          ))}
          <p className="my-1 border-t border-dashed border-tinta-600" />
          <Row l="Gravado" r={money(d.gravado)} />
          <Row l="IVA 13%" r={money(d.iva)} />
          {d.retencion > 0 && <Row l="Retención 1%" r={`−${money(d.retencion)}`} />}
          <Row l="TOTAL" r={money(d.total)} b />
          {d.metodo_pago && <Row l="Pago" r={d.metodo_pago} />}
          {d.metodo_pago === 'EFECTIVO' && (
            <>
              <Row l="Recibido" r={money(d.efectivo_recibido ?? 0)} />
              <Row l="Vuelto" r={money(d.vuelto ?? 0)} />
            </>
          )}
          <p className="my-1 border-t border-dashed border-tinta-600" />
          <p className="text-center">Número de control</p>
          <p className="break-all text-center">{d.numero_control}</p>
          <p className="text-center">Código de generación</p>
          <p className="break-all text-center">{d.codigo_generacion}</p>
          <p className="text-center">Sello de recepción</p>
          <p className="break-all text-center">
            {provisional ? 'Pendiente · se asignará al transmitir el lote' : d.sello_recepcion}
          </p>
          <p className="my-1 border-t border-dashed border-tinta-600" />
          <p className="text-center text-[10px]">Prototipo de demostración. Sin validez fiscal.</p>
        </div>
      </div>
    </Modal>
  );
}
