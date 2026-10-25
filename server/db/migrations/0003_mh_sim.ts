import { sql } from 'kysely';
import type { AnyDb } from '../types.js';

/**
 * Estado propio del simulador del MH, en un esquema separado. El API de negocio NUNCA lee
 * este esquema: solo la semilla escribe en él el registro del emisor y el padrón (equivalente
 * al alta del contribuyente ante el MH).
 */
export async function up(db: AnyDb): Promise<void> {
  await sql`
    CREATE SCHEMA IF NOT EXISTS mh_sim;

    CREATE TABLE mh_sim.estado (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      modo TEXT NOT NULL DEFAULT 'EN_LINEA' CHECK (modo IN ('EN_LINEA', 'SIN_CONEXION', 'LENTA')),
      latencia_ms INTEGER NOT NULL DEFAULT 5000,
      rechazar_proximo TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO mh_sim.estado (id) VALUES (1);

    CREATE TABLE mh_sim.emisor (
      nit TEXT PRIMARY KEY,
      nrc TEXT NOT NULL,
      nombre TEXT NOT NULL,
      clave_api TEXT NOT NULL,
      public_key_pem TEXT NOT NULL
    );

    CREATE TABLE mh_sim.padron (
      nrc TEXT PRIMARY KEY,
      activo BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE mh_sim.documento (
      codigo_generacion TEXT PRIMARY KEY,
      tipo_dte TEXT NOT NULL,
      numero_control TEXT NOT NULL,
      nit_emisor TEXT NOT NULL,
      estado TEXT NOT NULL CHECK (estado IN ('PROCESADO', 'INVALIDADO')),
      sello_recepcion TEXT NOT NULL,
      fh_procesamiento TIMESTAMPTZ NOT NULL DEFAULT now(),
      fh_emision TIMESTAMPTZ NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      json JSONB NOT NULL
    );

    CREATE TABLE mh_sim.rechazo (
      id BIGSERIAL PRIMARY KEY,
      codigo_generacion TEXT NOT NULL,
      codigo TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE mh_sim.anulacion (
      codigo_generacion TEXT PRIMARY KEY,
      documento_codigo_generacion TEXT NOT NULL REFERENCES mh_sim.documento(codigo_generacion),
      sello_recepcion TEXT NOT NULL,
      fh_procesamiento TIMESTAMPTZ NOT NULL DEFAULT now(),
      json JSONB NOT NULL
    );
  `.execute(db);
}

export async function down(db: AnyDb): Promise<void> {
  await sql`DROP SCHEMA mh_sim CASCADE`.execute(db);
}
