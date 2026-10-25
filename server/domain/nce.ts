import { divHalfUp, type Cents } from './money.js';
import type { Totals } from './tax.js';

export type OriginalLine = { lineaId: string; cantidad: number; precioUnitario: Cents };
export type Devolucion = { lineaId: string; cantidad: number };

export class NceError extends Error {
  constructor(
    public code:
      'NCE_SIN_LINEAS' | 'NCE_CANTIDAD_EXCEDIDA' | 'NCE_MONTO_EXCEDIDO' | 'NCE_LINEA_INEXISTENTE',
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/**
 * RF-NCE-02: totales de la NCE con impuestos revertidos de forma proporcional al gravado devuelto.
 * Si se devuelve todo, coincide exactamente con el original.
 */
export function computeNceTotals(
  original: Totals,
  lineas: OriginalLine[],
  devolucion: Devolucion[],
  yaDevuelto: Record<string, number> = {},
): Totals & { lineas: Array<OriginalLine & { gravado: Cents }> } {
  const sel = devolucion.filter((d) => d.cantidad > 0);
  if (sel.length === 0)
    throw new NceError('NCE_SIN_LINEAS', 'Seleccione al menos un ítem a devolver.');
  const out = sel.map((d) => {
    const l = lineas.find((x) => x.lineaId === d.lineaId);
    if (!l)
      throw new NceError(
        'NCE_LINEA_INEXISTENTE',
        'La línea no pertenece al documento original.',
        d.lineaId,
      );
    const disponible = l.cantidad - (yaDevuelto[l.lineaId] ?? 0);
    if (!Number.isInteger(d.cantidad) || d.cantidad > disponible) {
      throw new NceError(
        'NCE_CANTIDAD_EXCEDIDA',
        `La cantidad a devolver supera lo disponible (${disponible}).`,
        d.lineaId,
      );
    }
    return { ...l, cantidad: d.cantidad, gravado: d.cantidad * l.precioUnitario };
  });
  const gravado = out.reduce((a, l) => a + l.gravado, 0);
  const prop = (x: Cents) =>
    original.gravado === 0 ? 0 : divHalfUp(x * gravado, original.gravado);
  const iva = prop(original.iva);
  const retencion = prop(original.retencion);
  return { gravado, iva, retencion, total: gravado + iva - retencion, lineas: out };
}

/** Criterio de fallo SRS-REQ-DTE-004: el acumulado de NCE no puede superar el total original. */
export function assertNceCap(originalTotal: Cents, acumuladoPrevio: Cents, nuevaNce: Cents): void {
  if (acumuladoPrevio + nuevaNce > originalTotal) {
    throw new NceError(
      'NCE_MONTO_EXCEDIDO',
      `El monto de la nota de crédito excede el documento original (disponible: ${originalTotal - acumuladoPrevio} centavos).`,
      'total',
    );
  }
}
