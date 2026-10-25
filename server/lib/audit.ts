import type { Kysely } from 'kysely';
import { db as defaultDb } from '../db/database.js';

/** Registro de auditoría de solo inserción (PRT-SEG-05, RNF-INV-02). */
export async function audit(
  entry: {
    usuarioId?: string | null;
    accion: string;
    entidad?: string;
    entidadId?: string;
    detalle?: unknown;
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: Kysely<any> = defaultDb,
): Promise<void> {
  await trx
    .insertInto('audit_log')
    .values({
      usuario_id: entry.usuarioId ?? null,
      accion: entry.accion,
      entidad: entry.entidad ?? null,
      entidad_id: entry.entidadId ?? null,
      detalle: entry.detalle === undefined ? null : JSON.stringify(entry.detalle),
    })
    .execute();
}
