import { sql, type RawBuilder } from 'kysely';

/** Columna NUMERIC(12,2) → centavos enteros en la respuesta (D-10). */
export function cents(column: string): RawBuilder<number> {
  return sql<number>`(round(${sql.ref(column)} * 100))::int`;
}

/** Centavos → literal NUMERIC para escribir. */
export function numeric(c: number): string {
  const sign = c < 0 ? '-' : '';
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}
