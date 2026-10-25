import { db as defaultDb } from '../db/database.js';
import type { AnyDb } from '../db/types.js';
import { AppError } from './errors.js';

export const MSG_NRC_INVALIDO =
  'El NRC no está registrado en el padrón del Ministerio de Hacienda. No se puede emitir crédito fiscal con este dato.';

export const NIT_RE = /^\d{4}-\d{6}-\d{3}-\d$/;
export const NRC_RE = /^\d{1,7}-\d$/;
export const DUI_RE = /^\d{8}-\d$/;

/** Padrón local que simula el del MH (regla 5). */
export async function nrcRegistrado(
  nrc: string,
  trx: AnyDb = defaultDb,
): Promise<{ razon_social: string } | null> {
  const r = await trx
    .selectFrom('padron_nrc')
    .select('razon_social')
    .where('nrc', '=', nrc.trim())
    .where('activo', '=', true)
    .executeTakeFirst();
  return r ?? null;
}

export async function assertNrcRegistrado(
  nrc: string | null | undefined,
  trx: AnyDb = defaultDb,
): Promise<void> {
  if (!nrc || !(await nrcRegistrado(nrc, trx))) {
    throw new AppError(422, 'NRC_NO_REGISTRADO', MSG_NRC_INVALIDO, 'nrc');
  }
}
