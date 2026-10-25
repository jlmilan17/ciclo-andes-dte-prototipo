import { simDb } from './db.js';

export type Modo = 'EN_LINEA' | 'SIN_CONEXION' | 'LENTA';
export type Estado = { modo: Modo; latencia_ms: number; rechazar_proximo: string | null };

export async function getEstado(): Promise<Estado> {
  return simDb
    .selectFrom('estado')
    .select(['modo', 'latencia_ms', 'rechazar_proximo'])
    .where('id', '=', 1)
    .executeTakeFirstOrThrow();
}

export async function setEstado(patch: Partial<Estado>): Promise<Estado> {
  await simDb
    .updateTable('estado')
    .set({ ...patch, updated_at: new Date() })
    .where('id', '=', 1)
    .execute();
  return getEstado();
}

/** Consume el rechazo forzado (aplica a un solo documento). */
export async function takeForcedRejection(): Promise<string | null> {
  return simDb.transaction().execute(async (trx) => {
    const e = await trx
      .selectFrom('estado')
      .select('rechazar_proximo')
      .where('id', '=', 1)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (!e.rechazar_proximo) return null;
    await trx.updateTable('estado').set({ rechazar_proximo: null }).where('id', '=', 1).execute();
    return e.rechazar_proximo as string;
  });
}
