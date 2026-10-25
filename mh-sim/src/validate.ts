import { createHash, randomInt } from 'node:crypto';
import { compactVerify, importSPKI } from 'jose';
import type { ZodError } from 'zod';
import { dteSchema, invalidacionSchema } from '../../server/dte/schemas/dte.schema.js';
import { CODIGOS_RECHAZO, isCodigo, type CodigoRechazo } from './codigos.js';
import { simDb } from './db.js';
import { takeForcedRejection } from './state.js';

export type Respuesta = {
  version: number;
  ambiente: '00';
  versionApp: number;
  estado: 'PROCESADO' | 'RECHAZADO';
  codigoGeneracion: string;
  selloRecibido: string | null;
  fhProcesamiento: string;
  clasificaMsg: string;
  codigoMsg: string;
  descripcionMsg: string;
  campo: string | null;
  observaciones: string[];
};

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** PRT-SIM-06: sello de recepción alfanumérico en mayúsculas. */
export function nuevoSello(): string {
  let s = String(new Date().getFullYear());
  while (s.length < 40) s += ALNUM[randomInt(ALNUM.length)];
  return s;
}

const base = (codigoGeneracion: string) => ({
  version: 2,
  ambiente: '00' as const,
  versionApp: 2,
  codigoGeneracion,
  fhProcesamiento: new Date().toISOString(),
});

export function rechazo(
  codigoGeneracion: string,
  codigo: CodigoRechazo,
  detalle?: string,
  campo?: string | null,
): Respuesta {
  const c = CODIGOS_RECHAZO[codigo];
  return {
    ...base(codigoGeneracion),
    estado: 'RECHAZADO',
    selloRecibido: null,
    clasificaMsg: '20',
    codigoMsg: codigo,
    descripcionMsg: c.descripcion,
    campo: campo === undefined ? c.campo : campo,
    observaciones: detalle ? [detalle] : [],
  };
}

function aceptado(
  codigoGeneracion: string,
  sello: string,
  observaciones: string[] = [],
): Respuesta {
  return {
    ...base(codigoGeneracion),
    estado: 'PROCESADO',
    selloRecibido: sello,
    clasificaMsg: '10',
    codigoMsg: '001',
    descripcionMsg: 'RECIBIDO',
    campo: null,
    observaciones,
  };
}

const zodField = (e: ZodError) => e.issues[0]?.path.join('.') ?? null;

/** Verifica la firma con la llave pública registrada del emisor. */
async function verificarFirma(
  jws: string,
): Promise<{ payload: unknown; nit: string } | { error: string }> {
  let nit: string;
  try {
    const p = JSON.parse(Buffer.from(jws.split('.')[1] ?? '', 'base64url').toString('utf8'));
    nit = p?.emisor?.nit;
  } catch {
    return { error: 'El documento no es un JWS compacto válido.' };
  }
  const emisor = await simDb
    .selectFrom('emisor')
    .select('public_key_pem')
    .where('nit', '=', nit ?? '')
    .executeTakeFirst();
  if (!emisor) return { error: `Emisor ${nit} no registrado.` };
  try {
    const { payload } = await compactVerify(jws, await importSPKI(emisor.public_key_pem, 'RS256'));
    return { payload: JSON.parse(new TextDecoder().decode(payload)), nit };
  } catch {
    return { error: 'La firma no corresponde al contenido o al certificado registrado.' };
  }
}

/** Hora de El Salvador (UTC−6, sin horario de verano). */
const fhEmision = (fecEmi: string, horEmi: string) => new Date(`${fecEmi}T${horEmi}-06:00`);

/**
 * PRT-SIM-05: validación real de un DTE (firma, esquema, duplicado, padrón, NCE sobre sellado).
 * `forzar` aplica el rechazo configurado desde el panel de simulación.
 */
export async function recibirDocumento(
  input: { tipoDte?: string; codigoGeneracion?: string; documento?: string },
  opts: { forzar?: boolean } = {},
): Promise<Respuesta> {
  const cg = input.codigoGeneracion ?? 'DESCONOCIDO';
  if (opts.forzar !== false) {
    const forced = await takeForcedRejection();
    if (forced && isCodigo(forced))
      return rechazo(cg, forced, 'Rechazo configurado en el panel de simulación.');
  }
  if (typeof input.documento !== 'string')
    return rechazo(cg, 'RCH-002', 'Falta el documento firmado.', 'documento');

  const firma = await verificarFirma(input.documento);
  if ('error' in firma) return rechazo(cg, 'RCH-001', firma.error);

  const parsed = dteSchema.safeParse(firma.payload);
  if (!parsed.success)
    return rechazo(cg, 'RCH-002', parsed.error.issues[0]?.message, zodField(parsed.error));
  const d = parsed.data;
  if (
    d.identificacion.codigoGeneracion !== input.codigoGeneracion ||
    d.identificacion.tipoDte !== input.tipoDte
  ) {
    return rechazo(
      cg,
      'RCH-002',
      'El tipoDte o codigoGeneracion del envío no coincide con el documento firmado.',
      'identificacion',
    );
  }

  const hash = createHash('sha256').update(input.documento).digest('hex');
  const previo = await simDb
    .selectFrom('documento')
    .select(['sello_recepcion', 'json'])
    .where('codigo_generacion', '=', cg)
    .executeTakeFirst();
  if (previo) {
    // Reenvío idéntico (p. ej. tras un timeout): idempotente, devuelve el sello original.
    if (previo.json?.__hash === hash)
      return aceptado(cg, previo.sello_recepcion, ['Documento ya recibido previamente.']);
    return rechazo(cg, 'RCH-003');
  }

  if ('nrc' in d.receptor) {
    const ok = await simDb
      .selectFrom('padron')
      .select('nrc')
      .where('nrc', '=', d.receptor.nrc)
      .where('activo', '=', true)
      .executeTakeFirst();
    if (!ok) return rechazo(cg, 'RCH-004', `NRC ${d.receptor.nrc} no encontrado.`);
  }

  if (d.identificacion.tipoDte === '05') {
    const ref = d.documentoRelacionado![0]!.numeroDocumento;
    const orig = await simDb
      .selectFrom('documento')
      .select('estado')
      .where('codigo_generacion', '=', ref)
      .executeTakeFirst();
    if (!orig || orig.estado !== 'PROCESADO')
      return rechazo(cg, 'RCH-005', `Documento relacionado ${ref} no sellado.`);
  }

  const sello = nuevoSello();
  await simDb
    .insertInto('documento')
    .values({
      codigo_generacion: cg,
      tipo_dte: d.identificacion.tipoDte,
      numero_control: d.identificacion.numeroControl,
      nit_emisor: firma.nit,
      estado: 'PROCESADO',
      sello_recepcion: sello,
      fh_emision: fhEmision(d.identificacion.fecEmi, d.identificacion.horEmi),
      total: d.resumen.totalPagar.toFixed(2),
      json: JSON.stringify({ ...d, __hash: hash }),
    })
    .execute();
  return aceptado(cg, sello);
}

export async function registrarRechazo(r: Respuesta) {
  if (r.estado === 'RECHAZADO') {
    await simDb
      .insertInto('rechazo')
      .values({
        codigo_generacion: r.codigoGeneracion,
        codigo: r.codigoMsg,
        descripcion: r.descripcionMsg,
      })
      .execute();
  }
}

/** Evento de invalidación: firma, esquema, documento sellado y plazo (ZG-07). */
export async function anularDocumento(
  input: { documento?: string },
  windowHours: number,
): Promise<Respuesta> {
  if (typeof input.documento !== 'string')
    return rechazo('DESCONOCIDO', 'RCH-002', 'Falta el evento firmado.', 'documento');
  const firma = await verificarFirma(input.documento);
  if ('error' in firma) return rechazo('DESCONOCIDO', 'RCH-001', firma.error);
  const parsed = invalidacionSchema.safeParse(firma.payload);
  if (!parsed.success)
    return rechazo(
      'DESCONOCIDO',
      'RCH-002',
      parsed.error.issues[0]?.message,
      zodField(parsed.error),
    );
  const ev = parsed.data;
  const cg = ev.identificacion.codigoGeneracion;
  const forced = await takeForcedRejection();
  if (forced && isCodigo(forced))
    return rechazo(cg, forced, 'Rechazo configurado en el panel de simulación.');

  const doc = await simDb
    .selectFrom('documento')
    .select(['estado', 'fh_emision', 'sello_recepcion'])
    .where('codigo_generacion', '=', ev.documento.codigoGeneracion)
    .executeTakeFirst();
  if (!doc || doc.estado !== 'PROCESADO' || doc.sello_recepcion !== ev.documento.selloRecibido) {
    return rechazo(
      cg,
      'RCH-005',
      'El documento a invalidar no existe, ya fue invalidado o el sello no coincide.',
      'documento.codigoGeneracion',
    );
  }
  const limite = new Date(doc.fh_emision).getTime() + windowHours * 3_600_000;
  if (Date.now() > limite)
    return rechazo(cg, 'RCH-006', `Plazo de ${windowHours} h vencido (parámetro provisional).`);

  const sello = nuevoSello();
  await simDb.transaction().execute(async (trx) => {
    await trx
      .updateTable('documento')
      .set({ estado: 'INVALIDADO' })
      .where('codigo_generacion', '=', ev.documento.codigoGeneracion)
      .execute();
    await trx
      .insertInto('anulacion')
      .values({
        codigo_generacion: cg,
        documento_codigo_generacion: ev.documento.codigoGeneracion,
        sello_recepcion: sello,
        json: JSON.stringify(ev),
      })
      .execute();
  });
  return aceptado(cg, sello);
}
