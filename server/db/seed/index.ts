import { seedBase } from './base.js';
import { seedCatalogo } from './catalogo.js';
import { truncateAll } from './reset.js';
import type { AnyDb } from '../types.js';

export type SeedOptions = { minimal?: boolean };

/** Estado de demostración completo; se puede ejecutar de nuevo (POST /sim/reset). */
export async function seedAll(db: AnyDb, opts: SeedOptions = {}) {
  await truncateAll(db);
  const base = await seedBase(db);
  const catalogo = await seedCatalogo(db, base.adminId, opts);
  return { ...base, ...catalogo };
}
