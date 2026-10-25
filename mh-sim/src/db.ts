import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

const url =
  process.env.NODE_ENV === 'test'
    ? (process.env.DATABASE_URL_TEST ?? 'postgres://ciclo:ciclo@localhost:5433/ciclo_andes_test')
    : (process.env.DATABASE_URL ?? 'postgres://ciclo:ciclo@localhost:5433/ciclo_andes');

/** El simulador solo lee y escribe su propio esquema `mh_sim`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const simDb = new Kysely<any>({
  dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 5 }) }),
}).withSchema('mh_sim');
