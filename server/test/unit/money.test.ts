import { describe, expect, it } from 'vitest';
import { centsToNumber, divHalfUp, fromCents, toCents } from '../../domain/money.js';

describe('money', () => {
  it('convierte a centavos enteros', () => {
    expect(toCents('578.00')).toBe(57800);
    expect(toCents('0.5')).toBe(50);
    expect(toCents(16)).toBe(1600);
    expect(toCents('-5.78')).toBe(-578);
  });
  it('rechaza más de dos decimales o texto', () => {
    expect(() => toCents('1.234')).toThrow();
    expect(() => toCents('abc')).toThrow();
  });
  it('formatea con dos decimales', () => {
    expect(fromCents(64736)).toBe('647.36');
    expect(fromCents(5)).toBe('0.05');
    expect(fromCents(-578)).toBe('-5.78');
    expect(centsToNumber(7514)).toBe(75.14);
  });
  it('redondea half-up', () => {
    expect(divHalfUp(5, 10)).toBe(1);
    expect(divHalfUp(4, 10)).toBe(0);
    expect(divHalfUp(15, 10)).toBe(2);
    expect(divHalfUp(25, 10)).toBe(3);
    expect(divHalfUp(-15, 10)).toBe(-2);
  });
});
