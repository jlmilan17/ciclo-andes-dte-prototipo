import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().default('postgres://ciclo:ciclo@localhost:5433/ciclo_andes'),
  DATABASE_URL_TEST: z.string().default('postgres://ciclo:ciclo@localhost:5433/ciclo_andes_test'),
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().default('change-me-dev-only'),
  JWT_TTL_MINUTES: z.coerce.number().default(30),
  CERT_SECRET: z.string().default('change-me-dev-only-32-bytes-min'),
  MH_SIM_URL: z.string().default('http://localhost:4100/mh-sim'),
  DEMO_MODE: bool,
  RETENTION_APPLIES_TO: z.enum(['receptor', 'emisor']).default('receptor'),
  INVALIDATION_WINDOW_HOURS: z.coerce.number().default(24),
  BATCH_MAX_DOCUMENTS: z.coerce.number().int().positive().default(100),
  CONTINGENCY_POLL_SECONDS: z.coerce.number().positive().default(60),
});

const parsed = schema.parse({ ...process.env, DEMO_MODE: process.env.DEMO_MODE ?? 'true' });

export const config = {
  ...parsed,
  databaseUrl: parsed.NODE_ENV === 'test' ? parsed.DATABASE_URL_TEST : parsed.DATABASE_URL,
};
export type Config = typeof config;
