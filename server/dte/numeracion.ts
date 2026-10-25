import { formatNumeroControl } from '../domain/numbering.js';
import type { TipoDte } from '../domain/tax.js';
import type { AnyDb } from '../db/types.js';

/**
 * Siguiente número de la secuencia, con la fila del contador bloqueada (SELECT … FOR UPDATE)
 * dentro de la transacción del llamador: sin huecos ni duplicados bajo concurrencia.
 */
export async function nextSequence(trx: AnyDb, tipo: TipoDte | 'CORTE_Z'): Promise<number> {
  const row = await trx
    .selectFrom('contador_numeracion')
    .select('ultimo')
    .where('tipo', '=', tipo)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const next = Number(row.ultimo) + 1;
  await trx
    .updateTable('contador_numeracion')
    .set({ ultimo: next })
    .where('tipo', '=', tipo)
    .execute();
  return next;
}

export async function nextNumeroControl(trx: AnyDb, tipo: TipoDte): Promise<string> {
  return formatNumeroControl(tipo, await nextSequence(trx, tipo));
}
