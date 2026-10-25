import { Router } from 'express';
import { sql } from 'kysely';
import { z } from 'zod';
import { db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { DUI_RE, NIT_RE, NRC_RE, assertNrcRegistrado, nrcRegistrado } from '../lib/padron.js';
import { cents } from '../lib/sql.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

export const clientesRouter = Router();
const PAGE = 25;

const clienteCols = [
  'c.id',
  'c.nit',
  'c.nrc',
  'c.dui',
  'c.razon_social',
  'c.nombre_comercial',
  'c.giro',
  'c.tipo_contribuyente',
  'c.departamento',
  'c.municipio',
  'c.direccion',
  'c.telefono',
  'c.correo',
  'c.activo',
  'c.es_consumidor_final_generico',
] as const;

/** RF-CLI-01: búsqueda parcial por nombre, NIT, NRC o DUI; normaliza guiones y espacios. */
clientesRouter.get('/clientes', requireAuth, async (req, res) => {
  const f = z
    .object({
      q: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      soloActivos: z.enum(['true', 'false']).optional(),
    })
    .parse(req.query);
  let q = db.selectFrom('cliente as c');
  if (f.q) {
    const texto = f.q.toLowerCase();
    const digitos = f.q.replace(/[^0-9]/g, '');
    q = q.where((eb) =>
      eb.or([
        eb('c.busqueda', 'like', `%${texto}%`),
        ...(digitos.length >= 3
          ? [eb(sql`replace(c.busqueda, ' ', '')`, 'like', `%${digitos}%`)]
          : []),
      ]),
    );
  }
  if (f.soloActivos === 'true') q = q.where('c.activo', '=', true);
  const total = await q.select(db.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
  const items = await q
    .select(clienteCols)
    .orderBy('c.es_consumidor_final_generico', 'desc')
    .orderBy('c.razon_social')
    .limit(PAGE)
    .offset((f.page - 1) * PAGE)
    .execute();
  res.json({ items, total: Number(total.n), page: f.page, pageSize: PAGE });
});

clientesRouter.get('/clientes/consumidor-final', requireAuth, async (_req, res) => {
  const c = await db
    .selectFrom('cliente as c')
    .select(clienteCols)
    .where('c.es_consumidor_final_generico', '=', true)
    .executeTakeFirst();
  if (!c) throw notFound('Consumidor final');
  res.json(c);
});

/** PRT-ADM-04: ficha con resumen e historial de DTE. */
clientesRouter.get('/clientes/:id', requireAuth, async (req, res) => {
  const c = await db
    .selectFrom('cliente as c')
    .select(clienteCols)
    .where('c.id', '=', req.params.id)
    .executeTakeFirst();
  if (!c) throw notFound('Cliente');
  const year = new Date().getFullYear();
  const resumen = await db
    .selectFrom('dte')
    .select([
      db.fn.countAll<number>().as('documentos'),
      sql<number>`coalesce(round(sum(CASE WHEN tipo = '05' THEN -total ELSE total END) FILTER (WHERE estado NOT IN ('INVALIDADO','RECHAZADO') AND extract(year FROM emitido_at) = ${year}) * 100), 0)::int`.as(
        'acumulado_anio',
      ),
      sql<string | null>`max(emitido_at)`.as('ultimo'),
    ])
    .where('cliente_id', '=', c.id)
    .executeTakeFirstOrThrow();
  const historial = await db
    .selectFrom('dte')
    .select([
      'id',
      'tipo',
      'numero_control',
      'codigo_generacion',
      'estado',
      'emitido_at',
      cents('total').as('total'),
    ])
    .where('cliente_id', '=', c.id)
    .orderBy('emitido_at', 'desc')
    .limit(50)
    .execute();
  res.json({ ...c, resumen: { ...resumen, documentos: Number(resumen.documentos) }, historial });
});

export const clienteBody = z
  .object({
    tipo_contribuyente: z.enum(['GRANDE', 'NORMAL', 'CONSUMIDOR_FINAL']),
    razon_social: z.string().trim().min(3, 'Ingrese el nombre o razón social.'),
    nombre_comercial: z.string().trim().nullish(),
    nit: z
      .string()
      .trim()
      .regex(NIT_RE, 'NIT con formato 0614-030417-103-8.')
      .nullish()
      .or(z.literal('')),
    nrc: z.string().trim().regex(NRC_RE, 'NRC con formato 189234-5.').nullish().or(z.literal('')),
    dui: z.string().trim().regex(DUI_RE, 'DUI con formato 04521987-3.').nullish().or(z.literal('')),
    giro: z.string().trim().nullish(),
    departamento: z.string().trim().nullish(),
    municipio: z.string().trim().nullish(),
    direccion: z.string().trim().nullish(),
    telefono: z.string().trim().nullish(),
    correo: z.string().trim().email('Correo inválido.').nullish().or(z.literal('')),
  })
  .superRefine((c, ctx) => {
    if (c.tipo_contribuyente !== 'CONSUMIDOR_FINAL') {
      if (!c.nit)
        ctx.addIssue({
          code: 'custom',
          path: ['nit'],
          message: 'El NIT es obligatorio para contribuyentes.',
        });
      if (!c.nrc)
        ctx.addIssue({
          code: 'custom',
          path: ['nrc'],
          message: 'El NRC es obligatorio para contribuyentes.',
        });
      if (!c.giro)
        ctx.addIssue({
          code: 'custom',
          path: ['giro'],
          message: 'El giro es obligatorio para contribuyentes.',
        });
    }
  });

export type ClienteBody = z.infer<typeof clienteBody>;

export function normalizeCliente(b: ClienteBody) {
  const n = (v: string | null | undefined) => (v ? v : null);
  return {
    ...b,
    nombre_comercial: n(b.nombre_comercial),
    nit: n(b.nit),
    nrc: b.tipo_contribuyente === 'CONSUMIDOR_FINAL' ? null : n(b.nrc),
    dui: n(b.dui),
    giro: n(b.giro),
    departamento: n(b.departamento),
    municipio: n(b.municipio),
    direccion: n(b.direccion),
    telefono: n(b.telefono),
    correo: n(b.correo),
  };
}

/** Alta (Cajero y Administrador). Un NRC fuera del padrón bloquea el alta de contribuyentes. */
clientesRouter.post('/clientes', requireAuth, async (req, res) => {
  const b = normalizeCliente(clienteBody.parse(req.body));
  if (b.tipo_contribuyente !== 'CONSUMIDOR_FINAL') await assertNrcRegistrado(b.nrc);
  const c = await db.insertInto('cliente').values(b).returning('id').executeTakeFirstOrThrow();
  await audit({
    usuarioId: req.user!.id,
    accion: 'CLIENTE_CREADO',
    entidad: 'cliente',
    entidadId: c.id,
    detalle: { razon_social: b.razon_social },
  });
  const full = await db
    .selectFrom('cliente as c')
    .select(clienteCols)
    .where('c.id', '=', c.id)
    .executeTakeFirstOrThrow();
  res.status(201).json(full);
});

clientesRouter.put('/clientes/:id', requireAuth, requireAdmin, async (req, res) => {
  const b = normalizeCliente(clienteBody.parse(req.body));
  const { activo } = z.object({ activo: z.boolean().default(true) }).parse(req.body);
  if (b.tipo_contribuyente !== 'CONSUMIDOR_FINAL') await assertNrcRegistrado(b.nrc);
  const r = await db
    .updateTable('cliente')
    .set({ ...b, activo })
    .where('id', '=', req.params.id)
    .executeTakeFirst();
  if (!Number(r.numUpdatedRows)) throw notFound('Cliente');
  await audit({
    usuarioId: req.user!.id,
    accion: 'CLIENTE_EDITADO',
    entidad: 'cliente',
    entidadId: req.params.id as string,
  });
  res.json({ ok: true });
});

clientesRouter.get('/padron/nrc/:nrc', requireAuth, async (req, res) => {
  const r = await nrcRegistrado(String(req.params.nrc));
  res.json(r ? { registrado: true, razon_social: r.razon_social } : { registrado: false });
});
