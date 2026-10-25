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
