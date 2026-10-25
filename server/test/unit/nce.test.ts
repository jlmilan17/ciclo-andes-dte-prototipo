import { describe, expect, it } from 'vitest';
import { NceError, assertNceCap, computeNceTotals } from '../../domain/nce.js';

const original = { gravado: 57800, iva: 7514, retencion: 578, total: 64736 };
const lineas = [
  { lineaId: 'bici', cantidad: 2, precioUnitario: 23500 },
  { lineaId: 'casco', cantidad: 2, precioUnitario: 3800 },
  { lineaId: 'luces', cantidad: 2, precioUnitario: 1600 },
];

describe('nota de crédito', () => {
  it('devolución total coincide con el original', () => {
    const t = computeNceTotals(
      original,
      lineas,
      lineas.map((l) => ({ lineaId: l.lineaId, cantidad: 2 })),
    );
    expect({ gravado: t.gravado, iva: t.iva, retencion: t.retencion, total: t.total }).toEqual(
      original,
    );
  });

  it('devolución parcial revierte impuestos proporcionalmente', () => {
    const t = computeNceTotals(original, lineas, [{ lineaId: 'bici', cantidad: 1 }]);
    expect(t.gravado).toBe(23500);
    expect(t.iva).toBe(3055); // 7514 × 235/578 = 3055.0
    expect(t.retencion).toBe(235);
    expect(t.total).toBe(23500 + 3055 - 235);
  });

  it('no permite devolver más de lo vendido considerando NCE previas', () => {
    expect(() =>
      computeNceTotals(original, lineas, [{ lineaId: 'bici', cantidad: 2 }], { bici: 1 }),
    ).toThrow(NceError);
    expect(() => computeNceTotals(original, lineas, [{ lineaId: 'bici', cantidad: 3 }])).toThrow(
      /supera/,
    );
  });

  it('exige al menos una línea', () => {
    expect(() => computeNceTotals(original, lineas, [])).toThrow(/al menos/);
  });

  it('el acumulado no puede superar el total original', () => {
    expect(() => assertNceCap(64736, 40000, 24736)).not.toThrow();
    expect(() => assertNceCap(64736, 40000, 24737)).toThrow(/excede/);
  });
});
