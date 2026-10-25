import type { AnyDb } from '../db/types.js';

export const ESTADOS = [
  'BORRADOR',
  'FIRMADO',
  'ENCOLADO',
  'TRANSMITIDO',
  'PROCESADO',
  'RECHAZADO',
  'INVALIDADO',
] as const;
export type EstadoDte = (typeof ESTADOS)[number];

/**
 * Transiciones permitidas (sección 4). TRANSMITIDO → ENCOLADO cubre el timeout del MH
 * (modo LENTA, RNF-CCFE-01): el documento vuelve a la cola de contingencia (ZG-15).
 */
export const TRANSITIONS: Readonly<Record<EstadoDte, readonly EstadoDte[]>> = {
  BORRADOR: ['FIRMADO'],
  FIRMADO: ['TRANSMITIDO', 'ENCOLADO'],
  ENCOLADO: ['TRANSMITIDO'],
  TRANSMITIDO: ['PROCESADO', 'RECHAZADO', 'ENCOLADO'],
  PROCESADO: ['INVALIDADO'],
  RECHAZADO: [],
  INVALIDADO: [],
};

export class InvalidTransitionError extends Error {
  readonly code = 'TRANSICION_INVALIDA';
  constructor(
    public from: EstadoDte,
    public to: EstadoDte,
  ) {
    super(`Transición no permitida: ${from} → ${to}`);
  }
}

export function canTransition(from: EstadoDte, to: EstadoDte): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EstadoDte, to: EstadoDte): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

type Trx = AnyDb;

export type TransitionInput = {
  dteId: string;
  to: EstadoDte;
  actor: string;
  motivo?: string;
  /** Respuesta del MH u otros datos del evento, guardados en dte_event.payload. */
  payload?: unknown;
  /** Columnas del DTE que cambian junto con el estado (sello, jws, etc.). */
  set?: Record<string, unknown>;
  /** Solo para la semilla de datos históricos: marca de tiempo del evento. */
  at?: Date;
};

/**
 * Única vía para cambiar el estado de un DTE. Bloquea la fila, valida la transición,
 * actualiza el estado y escribe la bitácora inmutable en dte_event, en la misma transacción.
 */
export async function transition(
  trx: Trx,
  input: TransitionInput,
): Promise<{ from: EstadoDte; to: EstadoDte }> {
  const row = await trx
    .selectFrom('dte')
    .select(['estado'])
    .where('id', '=', input.dteId)
    .forUpdate()
    .executeTakeFirst();
  if (!row) throw new Error(`DTE ${input.dteId} no existe`);
  const from = row.estado as EstadoDte;
  assertTransition(from, input.to);
  await trx
    .updateTable('dte')
    .set({ ...(input.set ?? {}), estado: input.to })
    .where('id', '=', input.dteId)
    .execute();
  await trx
    .insertInto('dte_event')
    .values({
      dte_id: input.dteId,
      estado_origen: from,
      estado_destino: input.to,
      actor: input.actor,
      motivo: input.motivo ?? null,
      payload: input.payload === undefined ? null : JSON.stringify(input.payload),
      ...(input.at ? { created_at: input.at } : {}),
    })
    .execute();
  return { from, to: input.to };
}

/** Evento de creación (sin estado de origen) para la bitácora del DTE. */
export async function recordCreation(
  trx: Trx,
  dteId: string,
  actor: string,
  at?: Date,
): Promise<void> {
  await trx
    .insertInto('dte_event')
    .values({
      dte_id: dteId,
      estado_origen: null,
      estado_destino: 'BORRADOR',
      actor,
      motivo: 'Documento generado',
      ...(at ? { created_at: at } : {}),
    })
    .execute();
}
