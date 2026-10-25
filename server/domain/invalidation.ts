/**
 * Plazo de invalidación (ZG-07). El valor de horas es un parámetro provisional
 * PENDIENTE DE VALIDAR CONTRA NORMATIVA; no representa un plazo legal.
 */
export function invalidationDeadline(emitidoAt: Date, windowHours: number): Date {
  return new Date(emitidoAt.getTime() + windowHours * 3_600_000);
}

export function isWithinInvalidationWindow(
  emitidoAt: Date,
  now: Date,
  windowHours: number,
): boolean {
  return now.getTime() <= invalidationDeadline(emitidoAt, windowHours).getTime();
}
