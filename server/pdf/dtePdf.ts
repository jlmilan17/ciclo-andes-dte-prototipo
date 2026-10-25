import type { DteDetalle } from '../dte/repo.js';
import { EMISOR } from '../dte/emisor.js';
import { PDFDocument, TIPO_NOMBRE, fecha, money, toBuffer } from './common.js';

const INK = '#101C18';
const MUTED = '#3D4B45';
const SELLO = '#0D6B57';
const AMBAR = '#A86A00';
const GRANATE = '#9B2C36';

/** Representación gráfica del DTE (sección 7). Provisional si aún no tiene sello. */
export async function dtePdf(d: DteDetalle): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 48,
    info: { Title: d.numero_control, Author: EMISOR.nombre },
  });
  const r = d.receptor as Record<string, string | null>;
  const provisional = !d.sello_recepcion;
  const W = doc.page.width - 96;

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(EMISOR.nombre);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text(`NIT ${EMISOR.nit} · NRC ${EMISOR.nrc}`);
  doc.text(EMISOR.descActividad);
  doc.text(`${EMISOR.direccion.complemento} · Tel. ${EMISOR.telefono}`);
  doc.text(`Establecimiento ${EMISOR.codEstableMH} · Punto de venta ${EMISOR.codPuntoVentaMH}`);
  doc.moveDown(0.8);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor(INK)
    .text(TIPO_NOMBRE[d.tipo] ?? 'DTE', { align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(MUTED)
    .text('Documento Tributario Electrónico · ESTRUCTURA DE DEMOSTRACIÓN', { align: 'center' });
  doc.moveDown(0.6);

  // Banda de sello
  const y0 = doc.y;
  const color =
    d.estado === 'INVALIDADO' || d.estado === 'RECHAZADO' ? GRANATE : provisional ? AMBAR : SELLO;
  doc
    .save()
    .dash(3, { space: 3 })
    .lineWidth(1.2)
    .strokeColor(color)
    .roundedRect(48, y0, W, 62, 6)
    .stroke()
    .restore();
  doc.font('Courier').fontSize(9).fillColor(INK);
  const row = (label: string, value: string, y: number, c = INK) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, 60, y);
    doc
      .fillColor(c)
      .font('Courier')
      .fontSize(9)
      .text(value, 200, y, { width: W - 160 });
  };
  row('Número de control', d.numero_control, y0 + 8);
  row('Código de generación', d.codigo_generacion, y0 + 24);
  row(
    'Sello de recepción',
    provisional ? 'Pendiente · se asignará al transmitir el lote' : d.sello_recepcion!,
    y0 + 40,
    provisional ? AMBAR : SELLO,
  );
  doc.y = y0 + 72;
  doc.x = 48;

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text(
    `Emisión: ${fecha(d.emitido_at)}    Estado: ${d.estado}${d.fh_procesamiento ? `    Procesado MH: ${fecha(d.fh_procesamiento)}` : ''}`,
  );
  if (d.ref_codigo_generacion)
    doc.text(`Documento relacionado: ${d.ref_numero_control} · ${d.ref_codigo_generacion}`);
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Receptor');
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(INK)
    .text(r.razon_social ?? 'Consumidor final');
  const ids = [r.nit && `NIT ${r.nit}`, r.nrc && `NRC ${r.nrc}`, r.dui && `DUI ${r.dui}`]
    .filter(Boolean)
    .join(' · ');
  if (ids) doc.fillColor(MUTED).text(ids);
  if (r.giro) doc.text(`Giro: ${r.giro}`);
  if (r.direccion) doc.text([r.direccion, r.municipio, r.departamento].filter(Boolean).join(', '));
  doc.moveDown(0.8);

  // Líneas
  const cols = [48, 80, 180, 380, 430, 500];
  const head = ['#', 'Código', 'Descripción', 'Cant.', 'P. unit.', 'Gravado'];
  let y = doc.y;
  doc.rect(48, y - 2, W, 16).fill('#F6F7F4');
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);
  head.forEach((h, i) =>
    doc.text(h, cols[i]!, y + 2, {
      width: (cols[i + 1] ?? 564) - cols[i]! - 4,
      align: i >= 3 ? 'right' : 'left',
    }),
  );
  y += 18;
  doc.font('Helvetica').fontSize(8.5).fillColor(INK);
  for (const l of d.lineas) {
    const cells = [
      String(l.num_item),
      l.codigo,
      l.descripcion,
      String(l.cantidad),
      money(l.precio_unitario),
      money(l.gravado),
    ];
    const h = Math.max(14, doc.heightOfString(l.descripcion, { width: 196 }) + 4);
    cells.forEach((c, i) =>
      doc.text(c, cols[i]!, y, {
        width: (cols[i + 1] ?? 564) - cols[i]! - 4,
        align: i >= 3 ? 'right' : 'left',
      }),
    );
    y += h;
    doc
      .moveTo(48, y - 2)
      .lineTo(48 + W, y - 2)
      .strokeColor('#DFE3DD')
      .lineWidth(0.5)
      .stroke();
  }
  y += 6;

  const tot = (label: string, v: string, bold = false) => {
    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(bold ? 11 : 9)
      .fillColor(INK);
    doc.text(label, 330, y, { width: 150, align: 'right' });
    doc.font(bold ? 'Courier-Bold' : 'Courier').text(v, 480, y, { width: 84, align: 'right' });
    y += bold ? 18 : 14;
  };
  tot('Total gravado', money(d.gravado));
  tot('IVA 13 %', money(d.iva));
  if (d.retencion) tot('(−) Retención 1 %', `-${money(d.retencion)}`);
  tot('TOTAL A PAGAR', money(d.total), true);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED);
  if (d.metodo_pago) doc.text(`Forma de pago: ${d.metodo_pago}`, 48, y);
  y += 24;

  doc
    .font('Helvetica-Oblique')
    .fontSize(7.5)
    .fillColor(provisional ? AMBAR : MUTED);
  doc.text(
    provisional
      ? 'Documento en contingencia — pendiente de sello. Versión provisional; el sello de recepción se asignará al transmitir el lote.'
      : 'Representación gráfica de un DTE sellado por el SIMULADOR del Ministerio de Hacienda.',
    48,
    y,
    { width: W },
  );
  doc.moveDown(0.4);
  doc
    .fillColor(MUTED)
    .text(
      'Prototipo de demostración (UCA). No tiene validez fiscal. Certificado de firma de pruebas.',
      { width: W },
    );
  return toBuffer(doc);
}
