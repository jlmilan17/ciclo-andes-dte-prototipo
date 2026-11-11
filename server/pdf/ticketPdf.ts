import type { DteDetalle } from '../dte/repo.js';
import { EMISOR } from '../dte/emisor.js';
import {
  PDFDocument,
  TIPO_NOMBRE,
  datosRepresentacion,
  fecha,
  money,
  qrDte,
  toBuffer,
} from './common.js';

const W80 = 226.77; // 80 mm en puntos

/** Ticket térmico de 80 mm (venta o comprobante provisional de contingencia). */
export async function ticketPdf(d: DteDetalle): Promise<Buffer> {
  const lineH = 11;
  const QR = 110; // ~39 mm: legible por un teléfono en papel térmico de 80 mm
  const rep = datosRepresentacion(d);
  const qr = await qrDte(d);
  const height = 360 + d.lineas.length * 24 + (qr ? QR + 24 : 0);
  const doc = new PDFDocument({ size: [W80, height], margin: 10 });
  const w = W80 - 20;
  const provisional = !d.sello_recepcion;
  const center = (t: string, bold = false, size = 8) =>
    doc
      .font(bold ? 'Courier-Bold' : 'Courier')
      .fontSize(size)
      .text(t, { width: w, align: 'center' });
  const lr = (l: string, r: string, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? 'Courier-Bold' : 'Courier')
      .fontSize(8)
      .text(l, 10, y, { width: w });
    doc.text(r, 10, y, { width: w, align: 'right' });
    doc.y = y + lineH;
  };
  const sep = () => center('-'.repeat(38));

  center(EMISOR.nombre.toUpperCase(), true, 9);
  center(`NIT ${EMISOR.nit}  NRC ${EMISOR.nrc}`);
  center(EMISOR.direccion.complemento);
  sep();
  center(TIPO_NOMBRE[d.tipo] ?? 'DTE', true, 7);
  if (provisional) center('DOCUMENTO EN CONTINGENCIA', true);
  if (provisional) center('PENDIENTE DE SELLO');
  sep();
  center(fecha(d.emitido_at));
  center(`Ambiente: ${rep.ambienteTxt}`);
  center(`Transmision: ${rep.transmision}`);
  center(`${d.caja ?? ''}  Cajero: ${d.emitido_por ?? ''}`);
  const r = d.receptor as { razon_social?: string; nit?: string | null; nrc?: string | null };
  center(`Cliente: ${r.razon_social ?? ''}`);
  const ids = [r.nit && `NIT ${r.nit}`, r.nrc && `NRC ${r.nrc}`].filter(Boolean).join('  ');
  if (ids) center(ids);
  sep();
  for (const l of d.lineas) {
    doc.font('Courier').fontSize(8).text(l.descripcion, 10, doc.y, { width: w });
    lr(`  ${l.cantidad} x ${money(l.precio_unitario)}`, money(l.gravado));
  }
  sep();
  lr('Gravado', money(d.gravado));
  lr('IVA 13%', money(d.iva));
  if (d.retencion) lr('Retencion 1%', `-${money(d.retencion)}`);
  lr('TOTAL', money(d.total), true);
  doc.font('Courier').fontSize(7).text(rep.totalLetras, 10, doc.y, { width: w });
  doc.moveDown(0.3);
  if (d.metodo_pago) lr('Pago', d.metodo_pago);
  if (d.metodo_pago === 'EFECTIVO') {
    lr('Recibido', money(d.efectivo_recibido));
    lr('Vuelto', money(d.vuelto));
  }
  sep();
  center('Numero de control', true, 7);
  center(d.numero_control, false, 7);
  center('Codigo de generacion', true, 7);
  center(d.codigo_generacion, false, 7);
  center('Sello de recepcion', true, 7);
  center(
    provisional ? 'Pendiente - se asignara al transmitir el lote' : d.sello_recepcion!,
    false,
    7,
  );
  sep();
  if (qr) {
    // QR hacia la consulta pública del SIMULADOR (ZG-22).
    const y = doc.y + 2;
    doc.image(qr, (W80 - QR) / 2, y, { width: QR, height: QR });
    doc.y = y + QR + 2;
    center('Consulta publica (simulada)', false, 7);
    if (provisional) center('Pendiente de procesamiento', false, 7);
    sep();
  }
  center('Prototipo de demostracion. Sin validez fiscal.', false, 7);
  return toBuffer(doc);
}
