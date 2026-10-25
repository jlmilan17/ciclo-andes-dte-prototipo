import { describe, expect, it } from 'vitest';
import { invalidationDeadline, isWithinInvalidationWindow } from '../../domain/invalidation.js';

describe('plazo de invalidación (ZG-07, parámetro provisional)', () => {
  const emitido = new Date('2026-10-20T10:00:00Z');
  it('calcula el vencimiento', () => {
    expect(invalidationDeadline(emitido, 24).toISOString()).toBe('2026-10-21T10:00:00.000Z');
  });
  it('dentro del plazo, en el límite y fuera', () => {
    expect(isWithinInvalidationWindow(emitido, new Date('2026-10-21T09:59:59Z'), 24)).toBe(true);
    expect(isWithinInvalidationWindow(emitido, new Date('2026-10-21T10:00:00Z'), 24)).toBe(true);
    expect(isWithinInvalidationWindow(emitido, new Date('2026-10-21T10:00:01Z'), 24)).toBe(false);
  });
});
