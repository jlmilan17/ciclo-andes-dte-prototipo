import { describe, expect, it } from 'vitest';
import {
  CODIGO_GENERACION_RE,
  NUMERO_CONTROL_RE,
  formatNumeroControl,
  newCodigoGeneracion,
} from '../../domain/numbering.js';

describe('numeración', () => {
  it('formatea el número de control', () => {
    expect(formatNumeroControl('03', 247)).toBe('DTE-03-M001P001-000000000000247');
    expect(NUMERO_CONTROL_RE.test(formatNumeroControl('05', 1))).toBe(true);
  });
  it('rechaza secuencias fuera de rango', () => {
    expect(() => formatNumeroControl('01', 0)).toThrow();
    expect(() => formatNumeroControl('01', 1e15)).toThrow();
  });
  it('genera UUID v4 en mayúsculas y únicos', () => {
    const set = new Set(Array.from({ length: 500 }, newCodigoGeneracion));
    expect(set.size).toBe(500);
    for (const c of set) expect(CODIGO_GENERACION_RE.test(c)).toBe(true);
  });
});
