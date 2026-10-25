import { describe, expect, it } from 'vitest';
import { weightedAverageCost } from '../../domain/avgCost.js';

describe('costo promedio ponderado', () => {
  it('18 u a $148.00 + 10 u a $162.00 → $153.00', () => {
    expect(weightedAverageCost(18, 14800, 10, 16200)).toBe(15300);
  });
  it('sin stock previo toma el costo del lote', () => {
    expect(weightedAverageCost(0, 0, 5, 1234)).toBe(1234);
  });
  it('redondea half-up', () => {
    // (1×100 + 2×101)/3 = 100.67
    expect(weightedAverageCost(1, 100, 2, 101)).toBe(101);
  });
  it('rechaza cantidad no positiva', () => {
    expect(() => weightedAverageCost(1, 100, 0, 100)).toThrow();
  });
});
