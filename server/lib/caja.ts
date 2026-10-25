import { db as defaultDb } from '../db/database.js';
import type { AnyDb } from '../db/types.js';
import type { AuthUser } from '../middleware/auth.js';
import { AppError } from './errors.js';
import { cents } from './sql.js';

/**
 * Caja en la que opera el usuario. El Administrador no tiene caja asignada: cuando usa el POS
 * opera sobre la Caja 01 (ZG-17).
 */
export async function cajaDelUsuario(
  user: AuthUser,
  trx: AnyDb = defaultDb,
): Promise<{ id: string; codigo: string; nombre: string }> {
  let q = trx.selectFrom('caja').select(['id', 'codigo', 'nombre']);
  q = user.cajaId ? q.where('id', '=', user.cajaId) : q.where('codigo', '=', 'CAJA 01');
  return q.executeTakeFirstOrThrow();
}

export async function turnoAbierto(cajaId: string, trx: AnyDb = defaultDb, lock = false) {
  let q = trx
    .selectFrom('turno_caja as t')
    .innerJoin('usuario as u', 'u.id', 't.cajero_id')
    .select([
      't.id',
      't.caja_id',
      't.cajero_id',
      't.apertura_at',
      cents('t.fondo_inicial').as('fondo_inicial'),
      'u.nombre as cajero',
    ])
    .where('t.caja_id', '=', cajaId)
    .where('t.estado', '=', 'ABIERTA');
  if (lock) q = q.forUpdate();
  return (await q.executeTakeFirst()) ?? null;
}

/** Regla 7: la terminal sin turno abierto rechaza ventas también en el backend. */
export async function requireTurnoAbierto(user: AuthUser, trx: AnyDb) {
  const caja = await cajaDelUsuario(user, trx);
  const turno = await turnoAbierto(caja.id, trx, true);
  if (!turno) {
    throw new AppError(
      409,
      'CAJA_CERRADA',
      `La ${caja.codigo} está cerrada. Abra un turno para registrar ventas.`,
    );
  }
  return { caja, turno };
}
