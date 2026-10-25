import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { migrateToLatest } from '../db/migrate.js';
import type { AnyDb } from '../db/types.js';

// Base de pruebas aislada: se limpia y migra antes de cada corrida (sin mocks de BD).
export default async function setup() {
  const url =
    process.env.DATABASE_URL_TEST ?? 'postgres://ciclo:ciclo@localhost:5433/ciclo_andes_test';
  const db: AnyDb = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(db);
  await sql`DROP SCHEMA IF EXISTS mh_sim CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  await migrateToLatest(db);
  await db.destroy();
}
