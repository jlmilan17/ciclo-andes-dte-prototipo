import { sql } from 'kysely';
import type { AnyDb } from '../types.js';

const TABLES = [
  'audit_log',
  'correo_simulado',
  'mh_exchange',
  'movimiento_inventario',
  'evento_invalidacion',
  'motivo_invalidacion',
  'dte_event',
  'dte_linea',
  'dte',
  'lote_contingencia',
  'venta',
  'lote_ingreso',
  'producto',
  'proveedor',
  'cliente',
  'padron_nrc',
  'turno_caja',
  'usuario',
  'caja',
  'config',
];

/** Vacía los datos de negocio. TRUNCATE no dispara los triggers por fila de las bitácoras inmutables. */
export async function truncateAll(db: AnyDb): Promise<void> {
  await sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`).execute(db);
  await sql`UPDATE contador_numeracion SET ultimo = 0`.execute(db);
}
