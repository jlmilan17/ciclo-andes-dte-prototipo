import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';

// NUMERIC llega como string; lo dejamos así y convertimos a centavos en el repositorio.
// BIGINT (OID 20) como number: los contadores caben en Number.MAX_SAFE_INTEGER.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
