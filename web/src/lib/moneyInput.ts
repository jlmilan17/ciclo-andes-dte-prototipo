import { toCents } from '@domain/money';

/** "148" | "148.5" | "$1,148.00" → centavos, o null si no es un monto válido. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[$,\s]/g, '');
  if (!clean) return null;
  try {
    const c = toCents(clean);
    return c >= 0 ? c : null;
  } catch {
    return null;
  }
}

export const centsToInput = (c: number) => (c / 100).toFixed(2);
