import { describe, expect, it } from 'vitest';
import {
  ESTADOS,
  InvalidTransitionError,
  assertTransition,
  canTransition,
  type EstadoDte,
} from '../../dte/stateMachine.js';

const permitidas: Array<[EstadoDte, EstadoDte]> = [
  ['BORRADOR', 'FIRMADO'],
  ['FIRMADO', 'TRANSMITIDO'],
  ['FIRMADO', 'ENCOLADO'],
  ['ENCOLADO', 'TRANSMITIDO'],
  ['TRANSMITIDO', 'PROCESADO'],
  ['TRANSMITIDO', 'RECHAZADO'],
  ['TRANSMITIDO', 'ENCOLADO'],
  ['PROCESADO', 'INVALIDADO'],
];
const key = (a: string, b: string) => `${a}->${b}`;
const set = new Set(permitidas.map(([a, b]) => key(a, b)));

describe('máquina de estados del DTE — matriz completa', () => {
  for (const from of ESTADOS) {
    for (const to of ESTADOS) {
      const ok = set.has(key(from, to));
      it(`${from} → ${to} ${ok ? 'permitida' : 'prohibida'}`, () => {
        expect(canTransition(from, to)).toBe(ok);
        if (ok) expect(() => assertTransition(from, to)).not.toThrow();
        else expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      });
    }
  }
  it('RECHAZADO e INVALIDADO son terminales', () => {
    expect(ESTADOS.some((t) => canTransition('RECHAZADO', t))).toBe(false);
    expect(ESTADOS.some((t) => canTransition('INVALIDADO', t))).toBe(false);
  });
});
