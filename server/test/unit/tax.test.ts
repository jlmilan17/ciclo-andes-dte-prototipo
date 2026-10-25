import { describe, expect, it } from 'vitest';
import { computeTotals, tipoForReceptor } from '../../domain/tax.js';

const canonica = [
  { cantidad: 2, precioUnitario: 23500 },
  { cantidad: 2, precioUnitario: 3800 },
  { cantidad: 2, precioUnitario: 1600 },
];

describe('motor tributario', () => {
  it('reproduce exactamente la venta canónica', () => {
    expect(computeTotals({ tipo: '03', lineas: canonica, receptor: 'GRANDE' })).toEqual({
      gravado: 57800,
      iva: 7514,
      retencion: 578,
      total: 64736,
    });
  });

  it('IVA 13% sobre el gravado', () => {
    expect(computeTotals({ tipo: '03', lineas: canonica, receptor: 'NORMAL' }).iva).toBe(7514);
  });

  it('sin retención para contribuyente normal aunque supere $100', () => {
    const t = computeTotals({ tipo: '03', lineas: canonica, receptor: 'NORMAL' });
    expect(t.retencion).toBe(0);
    expect(t.total).toBe(57800 + 7514);
  });

  it('límite exacto $100.00 no retiene; $100.01 sí', () => {
    const at = computeTotals({
      tipo: '03',
      lineas: [{ cantidad: 1, precioUnitario: 10000 }],
      receptor: 'GRANDE',
    });
    expect(at.retencion).toBe(0);
    const over = computeTotals({
      tipo: '03',
      lineas: [{ cantidad: 1, precioUnitario: 10001 }],
      receptor: 'GRANDE',
    });
    expect(over.retencion).toBe(100);
    expect(over.iva).toBe(1300);
  });

  it('FCFE nunca retiene (ZG-02)', () => {
    const t = computeTotals({ tipo: '01', lineas: canonica, receptor: 'GRANDE' });
    expect(t.retencion).toBe(0);
  });

  it('ZG-06 configurable: retención por emisor', () => {
    const base = {
      tipo: '03' as const,
      lineas: canonica,
      receptor: 'GRANDE' as const,
      retentionAppliesTo: 'emisor' as const,
    };
    expect(computeTotals({ ...base, emisorGranContribuyente: false }).retencion).toBe(0);
    expect(computeTotals({ ...base, emisorGranContribuyente: true }).retencion).toBe(578);
  });

  it('redondea half-up el IVA del documento', () => {
    // 0.50 × 13% = 0.065 → 0.07
    expect(
      computeTotals({
        tipo: '01',
        lineas: [{ cantidad: 1, precioUnitario: 50 }],
        receptor: 'CONSUMIDOR_FINAL',
      }).iva,
    ).toBe(7);
  });

  it('rechaza cantidades no enteras o no positivas', () => {
    expect(() =>
      computeTotals({
        tipo: '01',
        lineas: [{ cantidad: 0, precioUnitario: 100 }],
        receptor: 'NORMAL',
      }),
    ).toThrow();
  });

  it('deriva el tipo de documento del receptor', () => {
    expect(tipoForReceptor('CONSUMIDOR_FINAL')).toBe('01');
    expect(tipoForReceptor('GRANDE')).toBe('03');
    expect(tipoForReceptor('NORMAL')).toBe('03');
  });
});
