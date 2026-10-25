import { Router } from 'express';
import { sql } from 'kysely';
import { db } from '../db/database.js';
import { cents } from '../lib/sql.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { colaPendiente, mhStatus } from '../mh/status.js';

export const resumenRouter = Router();

const HOY = sql<boolean>`(emitido_at AT TIME ZONE 'America/El_Salvador')::date = (now() AT TIME ZONE 'America/El_Salvador')::date`;

/** PRT-ADM-01 (propuesta de diseño, ZG-04): resumen del día para el Administrador. */
resumenRouter.get('/resumen', requireAuth, requireAdmin, async (_req, res) => {
  const ventas = await db
    .selectFrom('dte')
    .select([
      db.fn.countAll<number>().as('n'),
      sql<number>`coalesce(round(sum(total) * 100), 0)::int`.as('total'),
    ])
    .where('tipo', 'in', ['01', '03'])
    .where('estado', 'not in', ['INVALIDADO', 'RECHAZADO'])
    .where(HOY)
    .executeTakeFirstOrThrow();
  const porTipo = await db
    .selectFrom('dte')
    .select(['tipo', 'estado', db.fn.countAll<number>().as('n')])
    .where(HOY)
    .groupBy(['tipo', 'estado'])
    .execute();
  const bajo = await db
    .selectFrom('producto')
    .select(['id', 'sku', 'nombre', 'stock', 'stock_minimo'])
    .where('activo', '=', true)
    .where('tipo', '=', 'bien')
    .whereRef('stock', '<=', 'stock_minimo')
    .orderBy('stock')
    .execute();
  const cajas = await db
    .selectFrom('caja as c')
    .leftJoin('turno_caja as t', (j) =>
      j.onRef('t.caja_id', '=', 'c.id').on('t.estado', '=', 'ABIERTA'),
    )
    .leftJoin('usuario as u', 'u.id', 't.cajero_id')
    .select(['c.codigo', 't.apertura_at', 'u.nombre as cajero'])
    .orderBy('c.codigo')
    .execute();
  const ultimos = await db
    .selectFrom('dte')
    .select([
      'id',
      'tipo',
      'numero_control',
      'estado',
      'emitido_at',
      'receptor',
      cents('total').as('total'),
    ])
    .orderBy('emitido_at', 'desc')
    .limit(6)
    .execute();
  res.json({
    ventasHoy: { documentos: Number(ventas.n), total: ventas.total },
    dteHoy: porTipo.map((r) => ({ tipo: r.tipo, estado: r.estado, n: Number(r.n) })),
    pendientes: await colaPendiente(),
    mh: mhStatus,
    bajoStock: {
      total: bajo.length,
      sinStock: bajo.filter((p) => p.stock === 0).length,
      items: bajo.slice(0, 6),
    },
    cajas,
    ultimos,
  });
});
