import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { evaluarInvalidable, invalidarDte } from '../dte/invalidacion.js';
import { buscarOriginal, emitirNce } from '../dte/nce.js';
import { corregirDte, emitirVenta } from '../dte/pipeline.js';
import { loadDte } from '../dte/repo.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { decodeJws } from '../dte/signer.js';
import { cents } from '../lib/sql.js';
import { sql } from 'kysely';
import { dtePdf } from '../pdf/dtePdf.js';
import { ticketPdf } from '../pdf/ticketPdf.js';

export const dteRouter = Router();

const ventaBody = z.object({
  cliente_id: z.string().uuid().nullable(),
  tipo: z.enum(['01', '03']).optional(),
  lineas: z
    .array(
      z.object({
        producto_id: z.string().uuid(),
        cantidad: z.number().int().min(1, 'Cantidad inválida.'),
      }),
    )
    .min(1, 'El carrito está vacío.'),
  metodo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']),
  efectivo_recibido: z.number().int().min(0).nullish(),
});

/** POST /ventas: confirma la venta y emite el DTE (F2). */
dteRouter.post('/ventas', requireAuth, async (req, res) => {
  const b = ventaBody.parse(req.body);
  // Cantidades del mismo producto en varias líneas se agrupan para el control de stock.
  const agrupadas = Object.values(
    b.lineas.reduce<Record<string, { producto_id: string; cantidad: number }>>((acc, l) => {
      acc[l.producto_id] = {
        producto_id: l.producto_id,
        cantidad: (acc[l.producto_id]?.cantidad ?? 0) + l.cantidad,
      };
      return acc;
    }, {}),
  );
  const r = await emitirVenta({ ...b, lineas: agrupadas }, req.user!);
  await audit({
    usuarioId: req.user!.id,
    accion: 'VENTA_EMITIDA',
    entidad: 'dte',
    entidadId: r.dte.id,
    detalle: { estado: r.dte.estado, total: r.dte.total },
  });
  res.status(201).json(r);
});

/** RF-NCE-01: búsqueda del documento original por UUID o número de control (Administrador). */
dteRouter.get('/nce/original', requireAuth, requireAdmin, async (req, res) => {
  const { q } = z
    .object({ q: z.string().trim().min(1, 'Ingrese el código de generación o número de control.') })
    .parse(req.query);
  res.json(await buscarOriginal(q));
});

/** SRS-REQ-DTE-004: emisión de NCE (Administrador). */
dteRouter.post('/dte/nce', requireAuth, requireAdmin, async (req, res) => {
  const b = z
    .object({
      original_id: z.string().uuid(),
      lineas: z
        .array(z.object({ linea_id: z.string().uuid(), cantidad: z.number().int().min(0) }))
        .min(1),
    })
    .parse(req.body);
  const r = await emitirNce(
    b.original_id,
    b.lineas.map((l) => ({ lineaId: l.linea_id, cantidad: l.cantidad })),
    req.user!,
  );
  await audit({
    usuarioId: req.user!.id,
    accion: 'NCE_EMITIDA',
    entidad: 'dte',
    entidadId: r.dte.id,
    detalle: { original: b.original_id, total: r.dte.total },
  });
  res.status(201).json(r);
});

/** Historial de DTE con filtros reales y paginación (25). */
dteRouter.get('/dte', requireAuth, async (req, res) => {
  const f = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      q: z.string().trim().optional(),
      tipo: z.enum(['01', '03', '05']).optional(),
      estado: z
        .enum([
          'BORRADOR',
          'FIRMADO',
          'ENCOLADO',
          'TRANSMITIDO',
          'PROCESADO',
          'RECHAZADO',
          'INVALIDADO',
        ])
        .optional(),
      desde: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      hasta: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse(req.query);
  let q = db.selectFrom('dte as d');
  if (f.q) {
    const like = `%${f.q.toLowerCase()}%`;
    q = q.where((eb) =>
      eb.or([
        eb(sql`lower(d.numero_control)`, 'like', like),
        eb(sql`lower(d.codigo_generacion)`, 'like', like),
        eb(sql`lower(d.receptor->>'razon_social')`, 'like', like),
      ]),
    );
  }
  if (f.tipo) q = q.where('d.tipo', '=', f.tipo);
  if (f.estado) q = q.where('d.estado', '=', f.estado);
  if (f.desde)
    q = q.where(sql`(d.emitido_at AT TIME ZONE 'America/El_Salvador')::date`, '>=', f.desde);
  if (f.hasta)
    q = q.where(sql`(d.emitido_at AT TIME ZONE 'America/El_Salvador')::date`, '<=', f.hasta);
  const total = await q.select(db.fn.countAll<number>().as('n')).executeTakeFirstOrThrow();
  const items = await q
    .select([
      'd.id',
      'd.tipo',
      'd.numero_control',
      'd.codigo_generacion',
      'd.estado',
      'd.emitido_at',
      'd.receptor',
      'd.sello_recepcion',
      cents('d.total').as('total'),
    ])
    .orderBy('d.emitido_at', 'desc')
    .limit(25)
    .offset((f.page - 1) * 25)
    .execute();
  res.json({ items, total: Number(total.n), page: f.page, pageSize: 25 });
});

dteRouter.get('/dte/:id', requireAuth, async (req, res) => {
  const d = await loadDte(String(req.params.id));
  const eventos = await db
    .selectFrom('dte_event')
    .select(['id', 'estado_origen', 'estado_destino', 'actor', 'motivo', 'payload', 'created_at'])
    .where('dte_id', '=', d.id)
    .orderBy('id')
    .execute();
  const invalidacion = await db
    .selectFrom('evento_invalidacion as e')
    .innerJoin('motivo_invalidacion as m', 'm.id', 'e.motivo_id')
    .innerJoin('usuario as u', 'u.id', 'e.responsable_id')
    .select([
      'e.codigo_generacion',
      'e.json',
      'e.jws',
      'e.sello',
      'e.observaciones',
      'e.respuesta_mh',
      'e.created_at',
      'm.descripcion as motivo',
      'u.nombre as responsable',
    ])
    .where('e.dte_id', '=', d.id)
    .executeTakeFirst();
  const notasCredito = await db
    .selectFrom('dte')
    .select(['id', 'numero_control', 'estado', 'emitido_at', cents('total').as('total')])
    .where('referenced_dte_id', '=', d.id)
    .where('tipo', '=', '05')
    .orderBy('emitido_at')
    .execute();
  const correccion = await db
    .selectFrom('dte')
    .select(['id', 'numero_control', 'estado'])
    .where('corrige_dte_id', '=', d.id)
    .executeTakeFirst();
  res.json({
    ...d,
    eventos,
    invalidacion: invalidacion ?? null,
    invalidable: await evaluarInvalidable(d.id),
    notasCredito,
    correccion: correccion ?? null,
  });
});

/** Pestaña "Firma": encabezado, carga útil y firma del JWS decodificados. */
dteRouter.get('/dte/:id/firma', requireAuth, async (req, res) => {
  const d = await db
    .selectFrom('dte')
    .select(['jws'])
    .where('id', '=', req.params.id)
    .executeTakeFirst();
  if (!d) throw notFound('DTE');
  if (!d.jws) {
    res.json(null);
    return;
  }
  res.json({ jws: d.jws, ...decodeJws(d.jws) });
});

dteRouter.get('/motivos-invalidacion', requireAuth, async (_req, res) => {
  res.json(await db.selectFrom('motivo_invalidacion').selectAll().orderBy('id').execute());
});

/** SRS-REQ-DTE-005: solo Administrador (RNF-INV-01). */
dteRouter.post('/dte/:id/invalidar', requireAuth, requireAdmin, async (req, res) => {
  const b = z
    .object({
      motivo_id: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      observaciones: z.string().trim().max(500).nullish(),
    })
    .parse(req.body);
  res.json(
    await invalidarDte(String(req.params.id), b.motivo_id, b.observaciones ?? null, req.user!),
  );
});

/** DTE rechazado: corregir y reenviar como documento nuevo (ZG-16). */
dteRouter.post('/dte/:id/corregir', requireAuth, async (req, res) => {
  const { cliente_id } = z
    .object({ cliente_id: z.string().uuid().nullish() })
    .parse(req.body ?? {});
  const r = await corregirDte(String(req.params.id), cliente_id, req.user!);
  await audit({
    usuarioId: req.user!.id,
    accion: 'DTE_CORREGIDO',
    entidad: 'dte',
    entidadId: String(req.params.id),
    detalle: { nuevo: r.dte.numeroControl },
  });
  res.status(201).json(r);
});

dteRouter.get('/dte/:id/json', requireAuth, async (req, res) => {
  const d = await db
    .selectFrom('dte')
    .select(['numero_control', 'json_original'])
    .where('id', '=', req.params.id)
    .executeTakeFirst();
  if (!d) throw notFound('DTE');
  if (req.query.download)
    res.setHeader('content-disposition', `attachment; filename="${d.numero_control}.json"`);
  res.json(d.json_original);
});

dteRouter.get('/dte/:id/pdf', requireAuth, async (req, res) => {
  const d = await loadDte(String(req.params.id));
  const buf = await dtePdf(d);
  res.setHeader('content-type', 'application/pdf');
  res.setHeader(
    'content-disposition',
    `${req.query.download ? 'attachment' : 'inline'}; filename="${d.numero_control}.pdf"`,
  );
  res.send(buf);
});

dteRouter.get('/dte/:id/ticket.pdf', requireAuth, async (req, res) => {
  const d = await loadDte(String(req.params.id));
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `inline; filename="ticket-${d.numero_control}.pdf"`);
  res.send(await ticketPdf(d));
});

/** "Enviar por correo": se guarda en la bandeja de salida local (simulado). */
dteRouter.post('/dte/:id/enviar-correo', requireAuth, async (req, res) => {
  const { destinatario } = z
    .object({ destinatario: z.string().trim().email('Correo inválido.') })
    .parse(req.body);
  const d = await loadDte(String(req.params.id));
  const c = await db
    .insertInto('correo_simulado')
    .values({
      dte_id: d.id,
      destinatario,
      asunto: `${d.numero_control} · Ciclo Andes, S.A. de C.V.`,
      cuerpo: [
        `Estimado/a ${(d.receptor as { razon_social?: string }).razon_social ?? 'cliente'}:`,
        '',
        `Adjuntamos su documento tributario electrónico ${d.numero_control}.`,
        `Código de generación: ${d.codigo_generacion}`,
        `Sello de recepción: ${d.sello_recepcion ?? 'pendiente (documento en contingencia)'}`,
        '',
        'Este correo fue generado por un prototipo de demostración y no se envió realmente.',
      ].join('\n'),
      adjuntos: JSON.stringify([
        { nombre: `${d.numero_control}.pdf`, tipo: 'application/pdf', ruta: `/dte/${d.id}/pdf` },
        { nombre: `${d.numero_control}.json`, tipo: 'application/json', ruta: `/dte/${d.id}/json` },
      ]),
      enviado_por: req.user!.id,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  await audit({
    usuarioId: req.user!.id,
    accion: 'CORREO_SIMULADO',
    entidad: 'dte',
    entidadId: d.id,
    detalle: { destinatario },
  });
  res.status(201).json({ id: c.id });
});

dteRouter.get('/correos', requireAuth, async (_req, res) => {
  const items = await db
    .selectFrom('correo_simulado as c')
    .leftJoin('usuario as u', 'u.id', 'c.enviado_por')
    .select([
      'c.id',
      'c.dte_id',
      'c.destinatario',
      'c.asunto',
      'c.cuerpo',
      'c.adjuntos',
      'c.created_at',
      'u.nombre as enviado_por',
    ])
    .orderBy('c.created_at', 'desc')
    .limit(100)
    .execute();
  res.json({ items });
});
