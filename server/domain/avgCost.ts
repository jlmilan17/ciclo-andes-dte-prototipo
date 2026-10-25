import { divHalfUp, type Cents } from './money.js';

/**
 * Costo promedio ponderado (RF-CAT-03):
 * (stock_actual × costo_actual + cant × costo_lote) / (stock_actual + cant), half-up a centavos.
 */
export function weightedAverageCost(
  stock: number,
  costoActual: Cents,
  cantidad: number,
  costoLote: Cents,
): Cents {
  if (!Number.isInteger(cantidad) || cantidad <= 0)
    throw new RangeError('La cantidad del lote debe ser positiva');
  const base = Math.max(stock, 0);
  return divHalfUp(base * costoActual + cantidad * costoLote, base + cantidad);
}
