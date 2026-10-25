import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/database.js';
import { emitirVenta } from '../dte/pipeline.js';
import { loadDte } from '../dte/repo.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
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

dteRouter.get('/dte/:id', requireAuth, async (req, res) => {
  const d = await loadDte(String(req.params.id));
  const eventos = await db
    .selectFrom('dte_event')
    .select(['id', 'estado_origen', 'estado_destino', 'actor', 'motivo', 'payload', 'created_at'])
    .where('dte_id', '=', d.id)
    .orderBy('id')
    .execute();
  res.json({ ...d, eventos });
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
