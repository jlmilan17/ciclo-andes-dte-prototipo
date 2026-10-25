import type { Kysely } from 'kysely';
import { seedBase } from './base.js';
import { truncateAll } from './reset.js';

export type SeedOptions = { minimal?: boolean };

/** Estado de demostración completo; se puede ejecutar de nuevo (POST /sim/reset). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedAll(db: Kysely<any>, _opts: SeedOptions = {}) {
  await truncateAll(db);
  const base = await seedBase(db);
  return base;
}
