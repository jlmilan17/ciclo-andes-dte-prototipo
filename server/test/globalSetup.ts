import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { migrateToLatest } from '../db/migrate.js';

// Base de pruebas aislada: se limpia y migra antes de cada corrida (sin mocks de BD).
export default async function setup() {
  const url =
    process.env.DATABASE_URL_TEST ?? 'postgres://ciclo:ciclo@localhost:5433/ciclo_andes_test';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }),
  });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(db);
  await sql`DROP SCHEMA IF EXISTS mh_sim CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
  await migrateToLatest(db);
  await db.destroy();
}
