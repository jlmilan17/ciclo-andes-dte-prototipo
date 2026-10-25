import { Router } from 'express';
import { db } from '../db/database.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { cents } from '../lib/sql.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { checkConnectivity, colaPendiente, mhStatus } from '../mh/status.js';
import { transmitirCola } from '../worker/contingency.js';
import { config } from '../config.js';

export const contingenciaRouter = Router();

/** Bandeja de contingencia (lectura para ambos roles). */
contingenciaRouter.get('/contingencia', requireAuth, async (_req, res) => {
  const cola = await db
    .selectFrom('dte as d')
    .select([
      'd.id',
      'd.tipo',
      'd.numero_control',
      'd.codigo_generacion',
      'd.emitido_at',
      'd.intentos_transmision',
      'd.receptor',
      cents('d.total').as('total'),
    ])
    .where('d.estado', '=', 'ENCOLADO')
    .orderBy('d.emitido_at')
    .execute();
  const lotes = await db
    .selectFrom('lote_contingencia as l')
    .select([
      'l.id',
      'l.created_at',
      'l.estado',
      'l.documentos',
      'l.origen',
      (eb) =>
        eb
          .selectFrom('dte')
          .select(eb.fn.countAll<number>().as('n'))
          .whereRef('dte.lote_id', '=', 'l.id')
          .where('dte.estado', 'in', ['PROCESADO', 'INVALIDADO'])
          .as('procesados'),
      (eb) =>
        eb
          .selectFrom('dte')
          .select(eb.fn.countAll<number>().as('n'))
          .whereRef('dte.lote_id', '=', 'l.id')
          .where('dte.estado', '=', 'RECHAZADO')
          .as('rechazados'),
    ])
    .orderBy('l.created_at', 'desc')
    .limit(20)
    .execute();
  res.json({
    mh: mhStatus,
    pendientes: await colaPendiente(),
    batchMax: config.BATCH_MAX_DOCUMENTS,
    pollSeconds: config.CONTINGENCY_POLL_SECONDS,
    cola,
    lotes: lotes.map((l) => ({
      ...l,
      procesados: Number(l.procesados),
      rechazados: Number(l.rechazados),
    })),
  });
});

/** Detalle del lote: JSON enviado y respuesta del MH por documento. */
contingenciaRouter.get('/contingencia/lotes/:id', requireAuth, async (req, res) => {
  const l = await db
    .selectFrom('lote_contingencia')
    .selectAll()
    .where('id', '=', req.params.id)
    .executeTakeFirst();
  if (!l) throw notFound('Lote');
  const docs = await db
    .selectFrom('dte')
    .select(['id', 'tipo', 'numero_control', 'estado', 'sello_recepcion'])
    .where('lote_id', '=', l.id)
    .orderBy('emitido_at')
    .execute();
  res.json({ ...l, docs });
});

contingenciaRouter.post(
  '/contingencia/probar-conexion',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const online = await checkConnectivity();
    await audit({
      usuarioId: req.user!.id,
      accion: 'PROBAR_CONEXION_MH',
      entidad: 'contingencia',
      detalle: { online },
    });
    res.json({ online, mh: mhStatus });
  },
);

/** "Transmitir lote ahora" (Administrador): acelera la demostración. */
contingenciaRouter.post('/contingencia/transmitir', requireAuth, requireAdmin, async (req, res) => {
  const online = await checkConnectivity();
  const lotes = online ? await transmitirCola('MANUAL', req.user!.nombre) : [];
  await audit({
    usuarioId: req.user!.id,
    accion: 'TRANSMITIR_LOTE',
    entidad: 'contingencia',
    detalle: { online, lotes: lotes.length },
  });
  res.json({ online, lotes, pendientes: await colaPendiente() });
});
