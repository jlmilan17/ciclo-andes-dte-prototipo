import { seedBase } from './base.js';
import { seedCatalogo } from './catalogo.js';
import { seedCertificado } from './certificado.js';
import { seedClientes } from './clientes.js';
import { seedDtes } from './dtes.js';
import { truncateAll } from './reset.js';
import type { AnyDb } from '../types.js';

export type SeedOptions = { minimal?: boolean; dtes?: boolean };

/** Estado de demostración completo; se puede ejecutar de nuevo (POST /sim/reset). */
export async function seedAll(db: AnyDb, opts: SeedOptions = {}) {
  await truncateAll(db);
  const base = await seedBase(db);
  const catalogo = await seedCatalogo(db, base.adminId, opts);
  const clientes = await seedClientes(db, opts);
  await seedCertificado(db);
  const dtes =
    opts.minimal || opts.dtes === false
      ? { dteIds: {} as Record<string, string> }
      : await seedDtes(db, { ...base, ...catalogo, ...clientes });
  return { ...base, ...catalogo, ...clientes, ...dtes };
}
