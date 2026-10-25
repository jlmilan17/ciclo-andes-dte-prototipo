import { EMISOR } from '../dte/emisor.js';
import type { CorteZ } from '../lib/corte.js';
import { PDFDocument, fecha, money, toBuffer } from './common.js';

/** Corte Z en formato térmico de 80 mm (RNF-CAJ-01). */
export async function cortePdf(c: CorteZ): Promise<Buffer> {
  const W = 226.77;
  const doc = new PDFDocument({
    size: [W, 560 + c.invalidados.documentos.length * 10],
    margin: 10,
  });
  const w = W - 20;
  const center = (t: string, bold = false, size = 8) =>
    doc
      .font(bold ? 'Courier-Bold' : 'Courier')
      .fontSize(size)
      .text(t, 10, doc.y, { width: w, align: 'center' });
  const lr = (l: string, r: string, bold = false) => {
    const y = doc.y;
    doc
      .font(bold ? 'Courier-Bold' : 'Courier')
      .fontSize(8)
      .text(l, 10, y, { width: w });
    doc.text(r, 10, y, { width: w, align: 'right' });
    doc.y = y + 11;
  };
  const sep = () => center('-'.repeat(38));
  center(EMISOR.nombre.toUpperCase(), true, 9);
  center(`NIT ${EMISOR.nit}  NRC ${EMISOR.nrc}`);
  sep();
  center(`CORTE Z #${String(c.numero ?? 0).padStart(4, '0')}`, true, 11);
  center(`${c.caja} · ${c.cajero}`);
  center(`Apertura ${fecha(c.apertura)}`);
  center(`Cierre   ${fecha(c.cierre)}`);
  sep();
  center('INGRESOS POR METODO DE PAGO', true);
  for (const [k, v] of Object.entries(c.porMetodo)) lr(`${k} (${v.ventas})`, money(v.monto));
  lr('TOTAL VENTAS', money(c.totalVentas), true);
  sep();
  center('DTE POR TIPO', true);
  lr(`FCFE 01 (${c.dtePorTipo['01'].cantidad})`, money(c.dtePorTipo['01'].monto));
  lr(`CCFE 03 (${c.dtePorTipo['03'].cantidad})`, money(c.dtePorTipo['03'].monto));
  lr(`NCE 05 (${c.dtePorTipo['05'].cantidad})`, `-${money(c.dtePorTipo['05'].monto)}`);
  lr('Pendientes contingencia', String(c.pendientesContingencia));
  lr('Rechazados', String(c.rechazados));
  sep();
  center('ANULADAS (EXCLUIDAS)', true);
  lr(`Invalidados (${c.invalidados.cantidad})`, money(c.invalidados.monto));
  for (const n of c.invalidados.documentos) center(n, false, 6.5);
  sep();
  center('EFECTIVO', true);
  lr('Fondo inicial', money(c.fondoInicial));
  lr('Ventas en efectivo', money(c.porMetodo.EFECTIVO.monto));
  lr('Esperado', money(c.efectivoEsperado), true);
  lr('Contado', c.efectivoContado === null ? '-' : money(c.efectivoContado));
  lr('Diferencia', c.diferencia === null ? '-' : money(c.diferencia), true);
  sep();
  center('Terminal bloqueada hasta nueva apertura.', false, 7);
  center('Prototipo de demostracion.', false, 7);
  return toBuffer(doc);
}
