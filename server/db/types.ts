import type { Kysely } from 'kysely';

/**
 * Instancia o transacción de Kysely sin esquema tipado: el prototipo usa SQL explícito
 * y valida en los bordes con zod (D-05).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = Kysely<any>;
