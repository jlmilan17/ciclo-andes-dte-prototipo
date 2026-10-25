import { AppError } from './errors.js';
import { cents } from './sql.js';
import type { AnyDb } from '../db/types.js';

export type TipoMovimiento =
  'INGRESO' | 'VENTA' | 'DEVOLUCION' | 'REVERSION_INVALIDACION' | 'AJUSTE';

type Mov = {
  productoId: string;
  tipo: TipoMovimiento;
  /** Positivo suma existencias, negativo descuenta. */
  delta: number;
  dteId?: string | null;
  loteId?: string | null;
  usuarioId?: string | null;
  /** Solo para la semilla de datos históricos. */
  at?: Date;
};

/**
 * Aplica un movimiento de inventario con la fila del producto bloqueada.
 * Los servicios no llevan existencias (PRT-POS-08) y se omiten.
 */
export async function applyMovement(trx: AnyDb, m: Mov): Promise<{ saldo: number } | null> {
  const p = await trx
    .selectFrom('producto')
    .select(['id', 'nombre', 'sku', 'tipo', 'stock', cents('costo_promedio').as('costo')])
    .where('id', '=', m.productoId)
    .forUpdate()
    .executeTakeFirst();
  if (!p) throw new AppError(404, 'NO_ENCONTRADO', 'Producto no encontrado.');
  if (p.tipo === 'servicio') return null;
  const saldo = p.stock + m.delta;
  if (saldo < 0) {
    throw new AppError(
      409,
      'STOCK_INSUFICIENTE',
      `Stock insuficiente para ${p.nombre}: disponible ${p.stock}.`,
      'cantidad',
      {
        productoId: p.id,
        disponible: p.stock,
      },
    );
  }
  await trx
    .updateTable('producto')
    .set({ stock: saldo, updated_at: new Date() })
    .where('id', '=', p.id)
    .execute();
  await trx
    .insertInto('movimiento_inventario')
    .values({
      producto_id: p.id,
      tipo: m.tipo,
      cantidad: m.delta,
      costo: (p.costo / 100).toFixed(2),
      referencia_dte_id: m.dteId ?? null,
      referencia_lote_id: m.loteId ?? null,
      saldo_resultante: saldo,
      usuario_id: m.usuarioId ?? null,
      ...(m.at ? { created_at: m.at } : {}),
    })
    .execute();
  return { saldo };
}
