import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Migrator, type Kysely } from 'kysely';

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Error') console.error(`migración fallida: ${r.migrationName}`);
  }
  if (error) throw error;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import('./database.js');
  await migrateToLatest(db);
  console.log('Migraciones aplicadas.');
  await db.destroy();
}
