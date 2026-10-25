import type { TipoDte } from './tax.js';

export const ESTABLECIMIENTO = 'M001';
export const PUNTO_VENTA = 'P001';

/** PRT-DTE-03: DTE-<tipo>-M001P001-<15 dígitos>. */
export function formatNumeroControl(
  tipo: TipoDte,
  secuencia: number,
  establecimiento = ESTABLECIMIENTO,
  puntoVenta = PUNTO_VENTA,
): string {
  if (!Number.isInteger(secuencia) || secuencia <= 0 || secuencia >= 1e15) {
    throw new RangeError('Secuencia fuera de rango');
  }
  return `DTE-${tipo}-${establecimiento}${puntoVenta}-${String(secuencia).padStart(15, '0')}`;
}

export const NUMERO_CONTROL_RE = /^DTE-(01|03|05)-[A-Z0-9]{4}[A-Z0-9]{4}-\d{15}$/;

/** PRT-DTE-04: UUID v4 en mayúsculas. */
export function newCodigoGeneracion(): string {
  return globalThis.crypto.randomUUID().toUpperCase();
}

export const CODIGO_GENERACION_RE =
  /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/;
