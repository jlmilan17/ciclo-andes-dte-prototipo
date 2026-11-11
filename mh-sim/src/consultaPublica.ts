import type { RequestHandler } from 'express';
import { simDb } from './db.js';

/**
 * Consulta pública del SIMULADOR (ZG-22): destino del QR de la representación gráfica.
 * Sin autenticación y fuera del modo de conexión (lo usaría un tercero desde su teléfono).
 * El formato de la URL y de la respuesta es provisional: NO replica el servicio real de Hacienda.
 */
export type ResultadoConsulta =
  | { encontrado: false; estado: 'NO_REGISTRADO'; mensaje: string }
  | {
      encontrado: true;
      estado: 'PROCESADO' | 'INVALIDADO';
      mensaje: string;
      sellado: true;
      invalidado: boolean;
      tipoDte: string;
      numeroControl: string;
      codigoGeneracion: string;
      ambiente: string;
      fecEmi: string;
      selloRecepcion: string;
      fhProcesamiento: string;
      total: string;
      invalidacion: { selloRecepcion: string; fhProcesamiento: string } | null;
    };

const AVISO = 'Consulta pública SIMULADA (prototipo de demostración). No tiene validez fiscal.';
const NO_REGISTRADO =
  'El documento no está registrado en el MH. Si se emitió en contingencia, está pendiente de procesamiento: el sello se asignará al transmitir el lote.';

export async function consultar(q: {
  ambiente: string;
  codGen: string;
  fechaEmi: string;
}): Promise<ResultadoConsulta> {
  const doc = await simDb
    .selectFrom('documento')
    .leftJoin('anulacion', 'anulacion.documento_codigo_generacion', 'documento.codigo_generacion')
    .select([
      'documento.codigo_generacion',
      'documento.tipo_dte',
      'documento.numero_control',
      'documento.estado',
      'documento.sello_recepcion',
      'documento.fh_procesamiento',
      'documento.total',
      'documento.json',
      'anulacion.sello_recepcion as inv_sello',
      'anulacion.fh_procesamiento as inv_fh',
    ])
    .where('documento.codigo_generacion', '=', q.codGen.toUpperCase())
    .executeTakeFirst();
  const ident = doc?.json?.identificacion as { ambiente?: string; fecEmi?: string } | undefined;
  // Ambiente y fecha deben coincidir: sin ellos el código de generación no basta para consultar.
  if (!doc || ident?.ambiente !== q.ambiente || ident?.fecEmi !== q.fechaEmi)
    return { encontrado: false, estado: 'NO_REGISTRADO', mensaje: NO_REGISTRADO };
  const invalidado = doc.estado === 'INVALIDADO';
  return {
    encontrado: true,
    estado: doc.estado,
    mensaje: invalidado
      ? 'Documento procesado y posteriormente INVALIDADO.'
      : 'Documento procesado por el MH (simulado).',
    sellado: true,
    invalidado,
    tipoDte: doc.tipo_dte,
    numeroControl: doc.numero_control,
    codigoGeneracion: doc.codigo_generacion,
    ambiente: ident.ambiente,
    fecEmi: ident.fecEmi,
    selloRecepcion: doc.sello_recepcion,
    fhProcesamiento: new Date(doc.fh_procesamiento).toISOString(),
    total: String(doc.total),
    invalidacion: doc.inv_sello
      ? { selloRecepcion: doc.inv_sello, fhProcesamiento: new Date(doc.inv_fh).toISOString() }
      : null,
  };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const fechaSv = (iso: string) =>
  new Date(iso).toLocaleString('es-SV', {
    timeZone: 'America/El_Salvador',
    dateStyle: 'short',
    timeStyle: 'medium',
  });

function html(r: ResultadoConsulta): string {
  const filas = r.encontrado
    ? [
        ['Estado', r.invalidado ? 'INVALIDADO' : 'PROCESADO (sellado)'],
        ['Tipo de DTE', r.tipoDte],
        ['Número de control', r.numeroControl],
        ['Código de generación', r.codigoGeneracion],
        ['Ambiente', r.ambiente === '00' ? '00 · Pruebas' : r.ambiente],
        ['Fecha de emisión', r.fecEmi],
        ['Sello de recepción', r.selloRecepcion],
        ['Procesado por el MH', fechaSv(r.fhProcesamiento)],
        ['Total', `$${r.total}`],
        ...(r.invalidacion
          ? [
              ['Sello de invalidación', r.invalidacion.selloRecepcion],
              ['Invalidado', fechaSv(r.invalidacion.fhProcesamiento)],
            ]
          : []),
      ]
    : [['Estado', 'NO REGISTRADO · pendiente de procesamiento o inexistente']];
  const color = !r.encontrado ? '#A86A00' : r.invalidado ? '#9B2C36' : '#0D6B57';
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Consulta pública DTE (simulada)</title>
<style>
body{margin:0;background:#F6F7F4;color:#101C18;font:15px/1.5 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}
.aviso{background:#FFF4DC;border:1px solid #E3C27A;border-radius:6px;padding:8px 12px;font-size:13px}
.msg{border-left:4px solid ${color};padding:8px 12px;margin:16px 0;background:#fff}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;background:#fff;padding:12px;border-radius:6px}
dt{color:#3D4B45;font-size:13px}dd{margin:0;font-family:"Courier New",monospace;word-break:break-all}
</style></head><body><main>
<h1>Consulta pública de DTE</h1>
<p class="aviso">${esc(AVISO)}</p>
<p class="msg">${esc(r.mensaje)}</p>
<dl>${filas.map(([k, v]) => `<dt>${esc(k!)}</dt><dd>${esc(v!)}</dd>`).join('')}</dl>
</main></body></html>`;
}

export const consultaPublica: RequestHandler = async (req, res) => {
  const p = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : '');
  const q = { ambiente: p('ambiente'), codGen: p('codGen'), fechaEmi: p('fechaEmi') };
  const json = req.accepts(['html', 'json']) === 'json';
  if (!q.ambiente || !q.codGen || !/^\d{4}-\d{2}-\d{2}$/.test(q.fechaEmi)) {
    const mensaje = 'Parámetros requeridos: ambiente, codGen y fechaEmi (AAAA-MM-DD).';
    res.status(400);
    if (json) res.json({ estado: 'ERROR', mensaje, aviso: AVISO });
    else res.type('html').send(html({ encontrado: false, estado: 'NO_REGISTRADO', mensaje }));
    return;
  }
  const r = await consultar(q);
  res.status(r.encontrado ? 200 : 404);
  if (json) res.json({ ...r, aviso: AVISO });
  else res.type('html').send(html(r));
};
