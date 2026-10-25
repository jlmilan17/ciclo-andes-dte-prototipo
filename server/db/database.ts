import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { AnyDb } from './types.js';

// NUMERIC llega como string; lo dejamos así y convertimos a centavos en el repositorio.
// BIGINT (OID 20) como number: los contadores caben en Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export const db: AnyDb = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({ pool }),
});
