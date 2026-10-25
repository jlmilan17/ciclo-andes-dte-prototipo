/** Montos siempre en centavos enteros (regla 11, ZG-12). */
export type Cents = number;

/** División entera con redondeo half-up (los montos del prototipo nunca son negativos al redondear). */
export function divHalfUp(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator === 0) {
    throw new RangeError('divHalfUp requiere enteros y denominador distinto de cero');
  }
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/** "578.00" | 578 | "578" → 57800. Rechaza más de dos decimales. */
export function toCents(value: string | number): Cents {
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new RangeError(`Monto inválido: ${value}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

/** 57800 → "578.00" (formato de columnas NUMERIC(12,2) y del JSON del DTE). */
export function fromCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Para el JSON del DTE: número con dos decimales. */
export function centsToNumber(cents: Cents): number {
  return Number(fromCents(cents));
}
