import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../db/database.js';
import { weightedAverageCost } from '../domain/avgCost.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { applyMovement } from '../lib/inventory.js';
import { cents, numeric } from '../lib/sql.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const productosRouter = Router();
export const PAGE_SIZE = 25;

const productoCols = [
  'p.id',
  'p.sku',
  'p.codigo_barras',
  'p.nombre',
  'p.categoria',
  'p.tipo',
  'p.stock',
  'p.stock_minimo',
  'p.activo',
  'p.updated_at',
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selectProductos(q: any) {
  return q.select([
    ...productoCols,
    cents('p.precio').as('precio'),
    cents('p.costo_promedio').as('costo_promedio'),
  ]);
}

/** Estado de inventario (PRT-ADM-02). */
export function estadoStock(p: {
  tipo: string;
  stock: number;
  stock_minimo: number;
  activo: boolean;
}) {
  if (!p.activo) return 'INACTIVO';
  if (p.tipo === 'servicio') return 'ACTIVO';
  if (p.stock === 0) return 'SIN_STOCK';
  if (p.stock <= p.stock_minimo) return 'BAJO_STOCK';
  return 'ACTIVO';
}

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().optional(),
  categoria: z.string().optional(),
  estado: z.enum(['ACTIVO', 'BAJO_STOCK', 'SIN_STOCK', 'INACTIVO']).optional(),
});

/** RNF-CAT-01: paginación real en servidor con búsqueda y filtros. */
productosRouter.get('/productos', requireAuth, requireAdmin, async (req, res) => {
  const f = listQuery.parse(req.query);
  let q = db.selectFrom('producto as p');
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    q = q.where((eb) =>
      eb.or([eb(sql`lower(p.nombre)`, 'like', like), eb(sql`lower(p.sku)`, 'like', like)]),
    );
  }
  if (f.categoria) q = q.where('p.categoria', '=', f.categoria);
  if (f.estado === 'INACTIVO') q = q.where('p.activo', '=', false);
  else if (f.estado) {
    q = q.where('p.activo', '=', true);
    if (f.estado === 'SIN_STOCK') q = q.where('p.tipo', '=', 'bien').where('p.stock', '=', 0);
    if (f.estado === 'BAJO_STOCK')
      q = q
        .where('p.tipo', '=', 'bien')
        .where('p.stock', '>', 0)
        .whereRef('p.stock', '<=', 'p.stock_minimo');
    if (f.estado === 'ACTIVO')
      q = q.where((eb) =>
        eb.or([eb('p.tipo', '=', 'servicio'), eb('p.stock', '>', eb.ref('p.stock_minimo'))]),
      );
  }
  const total = await q.select(db.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
  const items = await selectProductos(q)
    .orderBy('p.sku')
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE)
    .execute();
  const categorias = await db
    .selectFrom('producto')
    .select('categoria')
    .distinct()
    .orderBy('categoria')
    .execute();
  res.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: items.map((p: any) => ({ ...p, estado: estadoStock(p) })),
    page: f.page,
    pageSize: PAGE_SIZE,
    total: Number(total.n),
    categorias: categorias.map((c) => c.categoria),
  });
});

/** PRT-POS-01: búsqueda del POS por SKU, código de barras o nombre (ambos roles). */
productosRouter.get('/productos/buscar', requireAuth, async (req, res) => {
  const { q } = z.object({ q: z.string().trim().default('') }).parse(req.query);
  if (!q) {
    res.json({ items: [] });
    return;
  }
  const upper = q.toUpperCase();
  const base = db
    .selectFrom('producto as p')
    .where('p.activo', '=', true)
    .where((eb) =>
      eb.or([
        eb('p.sku', '=', upper),
        eb('p.codigo_barras', '=', q),
        eb('p.sku', 'like', `${upper}%`),
        eb(sql`lower(p.nombre)`, 'like', `%${q.toLowerCase()}%`),
      ]),
    );
  const items = await selectProductos(base)
    .orderBy(sql`(p.sku = ${upper} OR p.codigo_barras = ${q})`, 'desc')
    .orderBy('p.nombre')
    .limit(10)
    .execute();
  res.json({
    items,
    exact:
      items.find(
        (p: { sku: string; codigo_barras: string | null }) =>
          p.sku === upper || p.codigo_barras === q,
      ) ?? null,
  });
});

productosRouter.get('/productos/sku-disponible', requireAuth, requireAdmin, async (req, res) => {
  const { sku, exceptId } = z
    .object({ sku: z.string().trim().toUpperCase(), exceptId: z.string().uuid().optional() })
    .parse(req.query);
  let q = db.selectFrom('producto').select('id').where('sku', '=', sku);
  if (exceptId) q = q.where('id', '<>', exceptId);
  res.json({ disponible: !(await q.executeTakeFirst()) });
});

productosRouter.get('/productos/:id', requireAuth, requireAdmin, async (req, res) => {
  const p = await selectProductos(db.selectFrom('producto as p'))
    .where('p.id', '=', req.params.id)
    .executeTakeFirst();
  if (!p) throw notFound('Producto');
  res.json({ ...p, estado: estadoStock(p) });
});

const SKU_RE = /^[A-Z0-9]{2,5}(-[A-Z0-9]{1,6}){1,3}$/;
const productoBody = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(SKU_RE, 'SKU con formato inválido (p. ej. BIC-MTB-0290).'),
  codigo_barras: z.string().trim().max(32).nullish(),
  nombre: z.string().trim().min(3, 'Nombre demasiado corto.').max(120),
  categoria: z.string().trim().min(2).max(40),
  tipo: z.enum(['bien', 'servicio']).default('bien'),
  precio: z.number().int('Precio inválido.').min(1, 'El precio debe ser mayor que cero.'),
  stock_minimo: z.number().int().min(0).default(0),
});

const SKU_DUP = () =>
  new AppError(
    409,
    'SKU_DUPLICADO',
    'Ya existe un producto con ese SKU. El SKU debe ser único.',
    'sku',
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isUniqueSku(e: any) {
  return e?.code === '23505' && e?.constraint === 'producto_sku_unico';
}

productosRouter.post('/productos', requireAuth, requireAdmin, async (req, res) => {
  const b = productoBody.parse(req.body);
  try {
    const p = await db
      .insertInto('producto')
      .values({ ...b, codigo_barras: b.codigo_barras ?? null, precio: numeric(b.precio), stock: 0 })
      .returning('id')
      .executeTakeFirstOrThrow();
    await audit({
      usuarioId: req.user!.id,
      accion: 'PRODUCTO_CREADO',
      entidad: 'producto',
      entidadId: p.id,
      detalle: { sku: b.sku },
    });
    res.status(201).json({ id: p.id });
  } catch (e) {
    if (isUniqueSku(e)) throw SKU_DUP();
    throw e;
  }
});

productosRouter.put('/productos/:id', requireAuth, requireAdmin, async (req, res) => {
  const b = productoBody.parse(req.body);
  try {
    const r = await db
      .updateTable('producto')
      .set({
        ...b,
        codigo_barras: b.codigo_barras ?? null,
        precio: numeric(b.precio),
        updated_at: new Date(),
      })
      .where('id', '=', req.params.id)
      .executeTakeFirst();
    if (!Number(r.numUpdatedRows)) throw notFound('Producto');
    await audit({
      usuarioId: req.user!.id,
      accion: 'PRODUCTO_EDITADO',
      entidad: 'producto',
      entidadId: req.params.id as string,
      detalle: b,
    });
    res.json({ ok: true });
  } catch (e) {
    if (isUniqueSku(e)) throw SKU_DUP();
    throw e;
  }
});

/** RF-CAT-01: deshabilitar es borrado lógico. */
productosRouter.patch('/productos/:id/estado', requireAuth, requireAdmin, async (req, res) => {
  const { activo } = z.object({ activo: z.boolean() }).parse(req.body);
  const r = await db
    .updateTable('producto')
    .set({ activo, updated_at: new Date() })
    .where('id', '=', req.params.id)
    .executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw notFound('Producto');
  await audit({
    usuarioId: req.user!.id,
    accion: activo ? 'PRODUCTO_HABILITADO' : 'PRODUCTO_DESHABILITADO',
    entidad: 'producto',
    entidadId: req.params.id as string,
  });
  res.json({ ok: true });
});

productosRouter.get('/productos/:id/movimientos', requireAuth, requireAdmin, async (req, res) => {
  const items = await db
    .selectFrom('movimiento_inventario as m')
    .leftJoin('dte as d', 'd.id', 'm.referencia_dte_id')
    .leftJoin('lote_ingreso as l', 'l.id', 'm.referencia_lote_id')
    .select([
      'm.id',
      'm.tipo',
      'm.cantidad',
      'm.saldo_resultante',
      'm.created_at',
      cents('m.costo').as('costo'),
      'm.referencia_dte_id',
      'd.numero_control',
      'm.referencia_lote_id',
      'l.factura_proveedor',
    ])
    .where('m.producto_id', '=', req.params.id)
    .orderBy('m.created_at', 'desc')
    .limit(100)
    .execute();
  res.json({ items });
});

productosRouter.get('/proveedores', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ items: await db.selectFrom('proveedor').selectAll().orderBy('nombre').execute() });
});

productosRouter.post('/proveedores', requireAuth, requireAdmin, async (req, res) => {
  const b = z
    .object({ nombre: z.string().trim().min(3), nit: z.string().trim().nullish() })
    .parse(req.body);
  const p = await db
    .insertInto('proveedor')
    .values({ nombre: b.nombre, nit: b.nit ?? null })
    .returning('id')
    .executeTakeFirstOrThrow();
  res.status(201).json({ id: p.id });
});

const loteBody = z.object({
  producto_id: z.string().uuid(),
  proveedor_id: z.string().uuid('Seleccione un proveedor.'),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1.'),
  costo_unitario: z.number().int().min(0),
  factura_proveedor: z.string().trim().min(1, 'Ingrese el número de factura del proveedor.'),
  fecha_recepcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** RF-CAT-02/03: ingreso de lote con proveedor y recálculo del costo promedio ponderado. */
productosRouter.post('/lotes', requireAuth, requireAdmin, async (req, res) => {
  const b = loteBody.parse(req.body);
  const result = await db.transaction().execute(async (trx) => {
    const p = await trx
      .selectFrom('producto')
      .select(['id', 'tipo', 'stock', 'sku', cents('costo_promedio').as('costo')])
      .where('id', '=', b.producto_id)
      .forUpdate()
      .executeTakeFirst();
    if (!p) throw notFound('Producto');
    if (p.tipo === 'servicio')
      throw new AppError(
        422,
        'PRODUCTO_SERVICIO',
        'Los servicios no llevan existencias.',
        'producto_id',
      );
    const nuevo = weightedAverageCost(p.stock, p.costo, b.cantidad, b.costo_unitario);
    const lote = await trx
      .insertInto('lote_ingreso')
      .values({
        ...b,
        costo_unitario: numeric(b.costo_unitario),
        costo_promedio_anterior: numeric(p.costo),
        costo_promedio_nuevo: numeric(nuevo),
        stock_anterior: p.stock,
        usuario_id: req.user!.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('producto')
      .set({ costo_promedio: numeric(nuevo) })
      .where('id', '=', p.id)
      .execute();
    const mov = await applyMovement(trx, {
      productoId: p.id,
      tipo: 'INGRESO',
      delta: b.cantidad,
      loteId: lote.id,
      usuarioId: req.user!.id,
    });
    await audit(
      {
        usuarioId: req.user!.id,
        accion: 'LOTE_INGRESADO',
        entidad: 'lote_ingreso',
        entidadId: lote.id,
        detalle: { sku: p.sku, cantidad: b.cantidad },
      },
      trx,
    );
    return { id: lote.id, costo_promedio: nuevo, stock: mov!.saldo };
  });
  res.status(201).json(result);
});

/** Comprobante de ingreso de lote. */
productosRouter.get('/lotes/:id', requireAuth, requireAdmin, async (req, res) => {
  const l = await db
    .selectFrom('lote_ingreso as l')
    .innerJoin('producto as p', 'p.id', 'l.producto_id')
    .innerJoin('proveedor as v', 'v.id', 'l.proveedor_id')
    .innerJoin('usuario as u', 'u.id', 'l.usuario_id')
    .select([
      'l.id',
      'l.cantidad',
      'l.factura_proveedor',
      'l.fecha_recepcion',
      'l.stock_anterior',
      'l.created_at',
      cents('l.costo_unitario').as('costo_unitario'),
      cents('l.costo_promedio_anterior').as('costo_promedio_anterior'),
      cents('l.costo_promedio_nuevo').as('costo_promedio_nuevo'),
      'p.sku',
      'p.nombre as producto',
      'v.nombre as proveedor',
      'u.nombre as usuario',
    ])
    .where('l.id', '=', req.params.id)
    .executeTakeFirst();
  if (!l) throw notFound('Lote');
  res.json(l);
});
