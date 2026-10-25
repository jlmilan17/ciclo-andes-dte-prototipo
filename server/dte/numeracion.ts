import type { Kysely } from 'kysely';
import { formatNumeroControl } from '../domain/numbering.js';
import type { TipoDte } from '../domain/tax.js';

/**
 * Siguiente número de la secuencia, con la fila del contador bloqueada (SELECT … FOR UPDATE)
 * dentro de la transacción del llamador: sin huecos ni duplicados bajo concurrencia.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextSequence(trx: Kysely<any>, tipo: TipoDte | 'CORTE_Z'): Promise<number> {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function nextNumeroControl(trx: Kysely<any>, tipo: TipoDte): Promise<string> {
  return formatNumeroControl(tipo, await nextSequence(trx, tipo));
}
