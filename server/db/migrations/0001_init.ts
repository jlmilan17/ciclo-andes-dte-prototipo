import { sql } from 'kysely';
import type { AnyDb } from '../types.js';

export async function up(db: AnyDb): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);
  await sql`CREATE TABLE config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`.execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql`DROP TABLE config`.execute(db);
}
