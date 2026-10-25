import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { db } from '../db/database.js';
import { seedAll } from '../db/seed/index.js';
import { audit } from '../lib/audit.js';
import { bus } from '../lib/bus.js';
import { AppError, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { certificateInfo } from '../dte/signer.js';
import { simAdmin } from '../mh/client.js';
import {
  checkConnectivity,
  colaPendiente,
  mhStatus,
  publishCola,
  setOnline,
} from '../mh/status.js';

export const simRouter = Router();

/** Herramientas de demostración: solo existen con DEMO_MODE. */
simRouter.use('/sim', requireAuth, (_req, _res, next) => {
  if (!config.DEMO_MODE) throw notFound('Ruta');
  next();
});

type SimEstado = { modo: string; latencia_ms: number; rechazar_proximo: string | null };

async function estadoCompleto() {
  const sim = await simAdmin<SimEstado>('/estado').catch(() => null);
  return { sim, simDisponible: sim !== null, mh: mhStatus, pendientes: await colaPendiente() };
}

simRouter.get('/sim/estado', async (_req, res) => {
  res.json(await estadoCompleto());
});

/** Interruptor "Simular caída de conexión MH" y modo Lenta (PRT-SIM-02/03). */
simRouter.post('/sim/estado', async (req, res) => {
  const b = z
    .object({
      modo: z.enum(['EN_LINEA', 'SIN_CONEXION', 'LENTA']),
      latencia_ms: z.number().int().min(0).max(30000).optional(),
    })
    .parse(req.body);
  let sim: SimEstado;
  try {
    sim = await simAdmin<SimEstado>('/estado', b);
  } catch {
    throw new AppError(503, 'SIMULADOR_NO_DISPONIBLE', 'El simulador del MH no está en ejecución.');
  }
  mhStatus.modo = sim.modo;
  await audit({
    usuarioId: req.user!.id,
    accion: 'SIM_MODO_CONEXION',
    entidad: 'simulador',
    detalle: b,
  });
  // El monitor verifica de inmediato; si vuelve la conexión, dispara la transmisión de la cola.
  const online = await checkConnectivity();
  setOnline(online, sim.modo);
  res.json(await estadoCompleto());
});

simRouter.post('/sim/rechazar-proximo', async (req, res) => {
  const { codigo } = z.object({ codigo: z.string().nullable() }).parse(req.body);
  const sim = await simAdmin('/rechazar-proximo', { codigo });
  await audit({
    usuarioId: req.user!.id,
    accion: 'SIM_RECHAZAR_PROXIMO',
    entidad: 'simulador',
    detalle: { codigo },
  });
  res.json(sim);
});

simRouter.get('/sim/codigos-rechazo', async (_req, res) => {
  res.json(await simAdmin('/codigos'));
});

/** "Expirar sesión ahora": invalida los tokens vigentes del usuario. */
simRouter.post('/sim/expirar-sesion', async (req, res) => {
  await db
    .updateTable('usuario')
    .set((eb) => ({ token_version: eb('token_version', '+', 1) }))
    .where('id', '=', req.user!.id)
    .execute();
  await audit({
    usuarioId: req.user!.id,
    accion: 'SIM_EXPIRAR_SESION',
    entidad: 'usuario',
    entidadId: req.user!.id,
  });
  res.json({ ok: true });
});

/** "Restablecer datos de demostración": vuelve a sembrar todo. */
simRouter.post('/sim/reset', async (_req, res) => {
  await seedAll(db);
  try {
    await simAdmin('/estado', { modo: 'EN_LINEA' });
  } catch {
    /* el simulador puede no estar arriba */
  }
  await checkConnectivity();
  bus.publish({ type: 'reset' });
  await publishCola();
  res.json({ ok: true });
});

/** Consola del MH (PRT-SIM-04). */
simRouter.get('/sim/consola', async (req, res) => {
  const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  const items = await db
    .selectFrom('mh_exchange as x')
    .leftJoin('dte as d', 'd.id', 'x.dte_id')
    .select([
      'x.id',
      'x.endpoint',
      'x.http_status',
      'x.resultado',
      'x.latencia_ms',
      'x.created_at',
      'x.dte_id',
      'x.lote_id',
      'd.numero_control',
      'd.tipo',
    ])
    .orderBy('x.id', 'desc')
    .limit(50)
    .offset((page - 1) * 50)
    .execute();
  res.json({ items, page });
});

simRouter.get('/sim/consola/:id', async (req, res) => {
  const x = await db
    .selectFrom('mh_exchange as x')
    .leftJoin('dte as d', 'd.id', 'x.dte_id')
    .selectAll('x')
    .select(['d.numero_control', 'd.codigo_generacion'])
    .where('x.id', '=', Number(req.params.id))
    .executeTakeFirst();
  if (!x) throw notFound('Intercambio');
  res.json(x);
});

/** Datos del certificado de pruebas para "Acerca de la simulación". */
simRouter.get('/sim/certificado', async (_req, res) => {
  const info = await certificateInfo();
  res.json({ ...info, publicKey: undefined });
});
